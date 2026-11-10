#include <boost/beast/core.hpp>
#include <boost/beast/http.hpp>
#include <boost/beast/version.hpp>
#include <boost/asio/ip/tcp.hpp>
#include <boost/config.hpp>
#include <boost/json.hpp>

#include <openssl/crypto.h>
#include <openssl/evp.h>
#include <openssl/hmac.h>

#include <algorithm>
#include <condition_variable>
#include <cstdlib>
#include <ctime>
#include <functional>
#include <iostream>
#include <mutex>
#include <queue>
#include <string>
#include <thread>
#include <vector>

namespace beast = boost::beast;
namespace http = beast::http;
namespace net = boost::asio;
namespace bj = boost::json;
using tcp = boost::asio::ip::tcp;

namespace {

// Task queue backing the fixed-size worker thread pool.
class task_queue
{
public:
    void enqueue(std::function<void()> task)
    {
        {
            std::unique_lock<std::mutex> lock(mutex_);
            tasks_.push(std::move(task));
        }
        cv_.notify_one();
    }

    std::function<void()> wait_and_pop()
    {
        std::unique_lock<std::mutex> lock(mutex_);
        cv_.wait(lock, [this] { return !tasks_.empty(); });
        std::function<void()> task = std::move(tasks_.front());
        tasks_.pop();
        return task;
    }

private:
    std::mutex mutex_;
    std::condition_variable cv_;
    std::queue<std::function<void()>> tasks_;
};

std::string to_hex(const unsigned char* data, size_t len)
{
    static const char hex[] = "0123456789abcdef";
    std::string out;
    out.reserve(len * 2);
    for (size_t i = 0; i < len; ++i)
    {
        out.push_back(hex[(data[i] >> 4) & 0xf]);
        out.push_back(hex[data[i] & 0xf]);
    }
    return out;
}

std::string hmac_sha256_hex(const std::string& key, const std::string& msg)
{
    unsigned char out[32];
    unsigned int out_len = 32;
    unsigned char* result = HMAC(
        EVP_sha256(),
        reinterpret_cast<const unsigned char*>(key.data()),
        static_cast<int>(key.size()),
        reinterpret_cast<const unsigned char*>(msg.data()),
        msg.size(),
        out,
        &out_len);
    return to_hex(out, out_len);
}

std::string sha256_hex(const std::string& msg)
{
    unsigned char out[32];
    unsigned int out_len = 0;
    EVP_MD_CTX* ctx = EVP_MD_CTX_new();
    EVP_DigestInit_ex(ctx, EVP_sha256(), nullptr);
    EVP_DigestUpdate(ctx, reinterpret_cast<const unsigned char*>(msg.data()), msg.size());
    EVP_DigestFinal_ex(ctx, out, &out_len);
    EVP_MD_CTX_free(ctx);
    return to_hex(out, out_len);
}

bool ct_equal(const std::string& a, const std::string& b)
{
    if (a.size() != b.size())
        return false;
    unsigned char diff = 0;
    for (size_t i = 0; i < a.size(); ++i)
        diff |= static_cast<unsigned char>(a[i]) ^ static_cast<unsigned char>(b[i]);
    return diff == 0;
}

// Verify a Telegram Web App initData string against the bot token.
// initData looks like: "user=eyJ...&auth_date=169...&hash=abc..."
// Returns true when the HMAC signature is valid and the auth_date is fresh.
bool verify_telegram_init_data(const std::string& initData, const std::string& botToken)
{
    // Split initData into key=value pairs.
    std::vector<std::pair<std::string, std::string>> params;
    size_t start = 0;
    while (start <= initData.size())
    {
        size_t amp = initData.find('&', start);
        size_t end = (amp == std::string::npos) ? initData.size() : amp;
        std::string kv = initData.substr(start, end - start);
        size_t eq = kv.find('=');
        if (eq != std::string::npos)
        {
            params.push_back({kv.substr(0, eq), kv.substr(eq + 1)});
        }
        if (amp == std::string::npos)
            break;
        start = amp + 1;
    }

    std::string hash;
    std::vector<std::pair<std::string, std::string>> signed_params;
    for (const auto& p : params)
    {
        if (p.first == "hash")
            hash = p.second;
        else
            signed_params.push_back(p);
    }

    // Telegram signs over sorted key=value pairs.
    std::sort(signed_params.begin(), signed_params.end(),
              [](const std::pair<std::string, std::string>& a,
                 const std::pair<std::string, std::string>& b)
              { return a.first < b.first; });

    std::string message = "auth_check:" + botToken + ":";
    for (size_t i = 0; i < signed_params.size(); ++i)
    {
        if (i > 0)
            message += "&";
        message += signed_params[i].first + "=" + signed_params[i].second;
    }

    std::string key = sha256_hex("bot" + botToken);
    std::string digest = hmac_sha256_hex(key, message);

    if (!ct_equal(digest, hash))
        return false;

    // Check auth_date freshness (Telegram allows a small window).
    long long authDate = 0;
    for (const auto& p : params)
    {
        if (p.first == "auth_date")
        {
            authDate = std::atoll(p.second.c_str());
            break;
        }
    }
    if (authDate <= 0)
        return false;

    long long now = static_cast<long long>(std::time(nullptr));
    if (now - authDate > 300)
        return false;

    return true;
}

std::string bot_token()
{
    const char* token = std::getenv("TELEGRAM_BOT_TOKEN");
    if (token == nullptr)
        token = std::getenv("BOT_TOKEN");
    return token ? std::string(token) : std::string();
}

// Return a response for the given request.
http::response<http::string_body>
handle_request(
    http::verb method,
    beast::string_view target,
    std::string body,
    unsigned version)
{
    http::response<http::string_body> res{http::status::ok, version};
    res.set(http::field::server, BOOST_BEAST_VERSION_STRING);
    res.set(http::field::content_type, "application/json");
    res.keep_alive(true);

    if (method == http::verb::get && target == "/")
    {
        res.body() = R"({"ok":true,"endpoint":"GET /"})";
    }
    else if (method == http::verb::post && target == "/auth/login")
    {
        // Handshake POST endpoint. The body is expected to be JSON:
        // { "initData": "<telegram initData>" }
        std::string initData;
        try
        {
            bj::value json_body = bj::parse(body);
            if (json_body.is_object())
            {
                bj::object obj = json_body.as_object();
                for (auto it = obj.begin(); it != obj.end(); ++it)
                {
                    if (it->key() == "initData" && it->value().is_string())
                    {
                        initData = it->value().as_string();
                    }
                }
            }
        }
        catch (...)
        {
            initData.clear();
        }

        std::string token = bot_token();
        bool ok = !initData.empty() && !token.empty() && verify_telegram_init_data(initData, token);

        if (ok)
        {
            res.body() = R"({"ok":true,"endpoint":"POST /auth/login"})";
        }
        else
        {
            res.body() = R"({"ok":false,"error":"invalid_init_data"})";
        }

        std::cout << "[beast] POST /auth/login verified=" << (ok ? "true" : "false") << std::endl;
    }
    else
    {
        http::response<http::string_body> not_found{http::status::not_found, version};
        not_found.set(http::field::server, BOOST_BEAST_VERSION_STRING);
        not_found.set(http::field::content_type, "application/json");
        not_found.keep_alive(true);
        not_found.body() = R"({"error":"not_found"})";
        not_found.prepare_payload();
        return not_found;
    }

    res.prepare_payload();
    return res;
}

// Handles a single HTTP session: reads requests until EOF or
// "Connection: close", writing a response for each one.
void do_session(tcp::socket& socket)
{
    beast::error_code ec;

    // This buffer is required to persist across reads
    beast::flat_buffer buffer;

    for (;;)
    {
        // Read a request
        http::request<http::string_body> req;
        http::read(socket, buffer, req, ec);
        if (ec == http::error::end_of_stream)
            break;
        if (ec)
            return;

        std::cout << "[beast] request: "
                  << (req.method() == http::verb::get ? "GET" : "POST")
                  << " " << std::string(req.target().data(), req.target().size())
                  << std::endl;

        // Handle request
        http::response<http::string_body> res =
            handle_request(req.method(), req.target(), req.body(), req.version());
        http::message_generator msg{std::move(res)};
        beast::write(socket, std::move(msg), ec);

        if (ec)
            return;
        if (!msg.keep_alive())
            break;
    }

    // Send a TCP shutdown
    socket.shutdown(tcp::socket::shutdown_send, ec);
}

} // namespace

int main(int argc, char* argv[])
{
    // Parse -cores=N (or "-cores N") and -port=N (or "-port N").
    int cores = std::thread::hardware_concurrency();
    if (cores < 1)
        cores = 1;
    int port = 8080;
    for (int i = 1; i < argc; ++i)
    {
        std::string arg = argv[i];
        if (arg == "-cores")
        {
            if (i + 1 < argc)
                cores = std::atoi(argv[++i]);
        }
        else if (arg == "-port")
        {
            if (i + 1 < argc)
                port = std::atoi(argv[++i]);
        }
        else
        {
            const std::string cores_prefix = "-cores=";
            if (arg.compare(0, cores_prefix.size(), cores_prefix) == 0)
            {
                cores = std::atoi(arg.c_str() + cores_prefix.size());
            }
            const std::string port_prefix = "-port=";
            if (arg.compare(0, port_prefix.size(), port_prefix) == 0)
            {
                port = std::atoi(arg.c_str() + port_prefix.size());
            }
        }
    }

    net::io_context ioc;
    net::ip::tcp::endpoint endpoint{
        net::ip::make_address("0.0.0.0"),
        static_cast<unsigned short>(port)};
    tcp::acceptor acceptor{ioc, endpoint};

    task_queue queue;
    std::vector<std::thread> threads;
    threads.reserve(static_cast<size_t>(cores));
    for (int i = 0; i < cores; ++i)
    {
        threads.emplace_back([&queue] {
            for (;;)
            {
                std::function<void()> task = queue.wait_and_pop();
                task();
            }
        });
    }

    std::cout << "[beast] server starting on 0.0.0.0:" << port << " with " << cores << " worker thread(s)" << std::endl;

    for (;;)
    {
        std::shared_ptr<tcp::socket> socket = std::make_shared<tcp::socket>(ioc);
        acceptor.accept(*socket);
        queue.enqueue([socket] { do_session(*socket); });
    }
}
