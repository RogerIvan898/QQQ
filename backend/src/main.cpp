#include <boost/beast/core.hpp>
#include <boost/beast/http.hpp>
#include <boost/beast/version.hpp>
#include <boost/asio/ip/tcp.hpp>
#include <boost/config.hpp>
#include <boost/json.hpp>

#include "telegram_auth.hpp"

#include <algorithm>
#include <chrono>
#include <condition_variable>
#include <csignal>
#include <cstdlib>
#include <ctime>
#include <functional>
#include <iostream>
#include <memory>
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

using request_type = http::request<http::string_body>;
using response_type = http::response<http::string_body>;

// How old Telegram's auth_date may be before a login is rejected.
constexpr long long kMaxAuthAgeSeconds = 24 * 60 * 60;

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

std::string to_str(beast::string_view v)
{
    return std::string(v.data(), v.size());
}

std::string trim(const std::string& s)
{
    const char* ws = " \t\r\n";
    size_t b = s.find_first_not_of(ws);
    if (b == std::string::npos)
        return std::string();
    size_t e = s.find_last_not_of(ws);
    return s.substr(b, e - b + 1);
}

std::string env_or_empty(const char* name)
{
    const char* v = std::getenv(name);
    return v ? trim(std::string(v)) : std::string();
}

std::string bot_token()
{
    std::string token = env_or_empty("TELEGRAM_BOT_TOKEN");
    if (token.empty())
        token = env_or_empty("BOT_TOKEN");
    return token;
}

// ---------------------------------------------------------------- CORS

// ALLOWED_ORIGINS: comma-separated list, e.g. "https://myname.gitlab.io".
// An origin is scheme + host (+ port), WITHOUT a path. Unset or "*" allows any origin.
std::vector<std::string> parse_allowed_origins()
{
    std::vector<std::string> out;
    const std::string raw = env_or_empty("ALLOWED_ORIGINS");
    size_t start = 0;
    while (start <= raw.size())
    {
        size_t comma = raw.find(',', start);
        size_t end = (comma == std::string::npos) ? raw.size() : comma;
        std::string item = trim(raw.substr(start, end - start));
        while (!item.empty() && item.back() == '/')
            item.pop_back();
        if (!item.empty())
            out.push_back(item);
        if (comma == std::string::npos)
            break;
        start = comma + 1;
    }
    return out;
}

// Value for Access-Control-Allow-Origin, or "" when the origin isn't allowed.
std::string cors_allow_origin(const std::string& request_origin)
{
    static const std::vector<std::string> allowed = parse_allowed_origins();
    if (allowed.empty())
        return "*";
    for (const std::string& a : allowed)
    {
        if (a == "*")
            return "*";
        if (!request_origin.empty() && a == request_origin)
            return request_origin;
    }
    return std::string();
}

void add_cors_headers(const request_type& req, response_type& res)
{
    std::string allow = cors_allow_origin(to_str(req[http::field::origin]));
    if (allow.empty())
        return;
    res.set(http::field::access_control_allow_origin, allow);
    if (allow != "*")
    {
        res.set(http::field::vary, "Origin");
        res.set(http::field::access_control_allow_credentials, "true");
    }
}

// Answer to the browser's CORS preflight (OPTIONS) request.
response_type make_preflight(const request_type& req)
{
    response_type res{http::status::no_content, req.version()};
    res.set(http::field::server, BOOST_BEAST_VERSION_STRING);
    add_cors_headers(req, res);
    res.set(http::field::access_control_allow_methods, "GET, POST, OPTIONS");
    // Echo whatever custom headers the frontend wants to send (Authorization, app header...).
    std::string wanted = to_str(req[http::field::access_control_request_headers]);
    res.set(http::field::access_control_allow_headers,
            wanted.empty() ? std::string("Content-Type, Authorization") : wanted);
    res.set(http::field::access_control_max_age, "600");
    res.keep_alive(false);
    res.prepare_payload();
    return res;
}

// ---------------------------------------------------------------- handlers

void set_json(response_type& res, http::status status, const std::string& body)
{
    res.result(status);
    res.body() = body;
}

// POST /auth/login   body: {"initData": "<Telegram.WebApp.initData>"}
//   200 {"ok":true,"user":{...}}  signature valid and fresh
//   400                            body is not JSON / no initData string
//   401                            signature invalid or expired
//   500                            server has no bot token configured
void handle_login(const request_type& req, response_type& res)
{
    const std::string token = bot_token();
    if (token.empty())
    {
        std::cerr << "[auth] BOT_TOKEN is not set, cannot verify logins" << std::endl;
        set_json(res, http::status::internal_server_error,
                 R"({"ok":false,"error":"server_misconfigured"})");
        return;
    }

    std::string init_data;
    boost::system::error_code jec;
    bj::value body = bj::parse(req.body(), jec);
    if (!jec && body.is_object())
    {
        if (const bj::value* v = body.as_object().if_contains("initData"))
        {
            if (v->is_string())
                init_data.assign(v->as_string().data(), v->as_string().size());
        }
    }
    if (init_data.empty())
    {
        set_json(res, http::status::bad_request, R"({"ok":false,"error":"bad_request"})");
        return;
    }

    tgauth::Result r = tgauth::verify(
        init_data, token, kMaxAuthAgeSeconds, static_cast<long long>(std::time(nullptr)));
    if (!r.ok)
    {
        // Never log initData or the token themselves.
        std::cout << "[auth] login rejected: " << r.error << std::endl;
        set_json(res, http::status::unauthorized, R"({"ok":false,"error":"invalid_init_data"})");
        return;
    }

    bj::object out;
    out["ok"] = true;
    boost::system::error_code uec;
    bj::value user = bj::parse(r.user_json, uec);
    if (!uec && user.is_object())
        out["user"] = std::move(user);
    else
        out["user"] = bj::value(nullptr);

    std::cout << "[auth] login ok" << std::endl;
    bj::value result(std::move(out));
    set_json(res, http::status::ok, bj::serialize(result));
}

response_type handle_request(const request_type& req)
{
    if (req.method() == http::verb::options)
        return make_preflight(req);

    response_type res{http::status::ok, req.version()};
    res.set(http::field::server, BOOST_BEAST_VERSION_STRING);
    res.set(http::field::content_type, "application/json");
    // One request per connection: a blocking worker is never held by an idle keep-alive socket.
    res.keep_alive(false);
    add_cors_headers(req, res);

    std::string target = to_str(req.target());
    size_t q = target.find('?');
    if (q != std::string::npos)
        target.resize(q);

    if (req.method() == http::verb::get && target == "/")
    {
        res.body() = R"({"ok":true,"endpoint":"GET /"})";
    }
    else if (req.method() == http::verb::post && target == "/auth/login")
    {
        handle_login(req, res);
    }
    else
    {
        res.result(http::status::not_found);
        res.body() = R"({"error":"not_found"})";
    }

    res.prepare_payload();
    return res;
}

// Handles one HTTP request on the socket, then closes the connection.
void do_session(tcp::socket& socket)
{
    beast::error_code ec;
    beast::flat_buffer buffer;

    http::request_parser<http::string_body> parser;
    parser.body_limit(16 * 1024); // initData is ~1-2 KB; refuse anything big
    http::read(socket, buffer, parser, ec);
    if (ec)
        return;

    request_type& req = parser.get();
    std::cout << "[beast] " << to_str(req.method_string()) << " " << to_str(req.target()) << std::endl;

    response_type res = handle_request(req);
    http::write(socket, res, ec);
    if (ec)
        return;

    socket.shutdown(tcp::socket::shutdown_send, ec);
}

} // namespace

int main(int argc, char* argv[])
{
    try
    {
        // Make `docker stop` / platform redeploys immediate (the server may be PID 1).
        std::signal(SIGTERM, [](int) { std::_Exit(0); });
        std::signal(SIGINT, [](int) { std::_Exit(0); });

        // Blocking worker model: keep a few threads even on tiny containers.
        int cores = static_cast<int>(std::thread::hardware_concurrency());
        if (cores < 4)
            cores = 4;

        // Hosting platforms (SnapDeploy, Heroku-likes) pass the port in $PORT.
        int port = 8080;
        if (const char* env_port = std::getenv("PORT"))
        {
            int p = std::atoi(env_port);
            if (p > 0)
                port = p;
        }

        // Command line overrides: -cores=N / -cores N, -port=N / -port N
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
                    cores = std::atoi(arg.c_str() + cores_prefix.size());
                const std::string port_prefix = "-port=";
                if (arg.compare(0, port_prefix.size(), port_prefix) == 0)
                    port = std::atoi(arg.c_str() + port_prefix.size());
            }
        }
        if (cores < 1)
            cores = 1;
        if (port < 1 || port > 65535)
        {
            std::cerr << "[beast] invalid port " << port << std::endl;
            return 1;
        }

        if (bot_token().empty())
            std::cerr << "[beast] WARNING: BOT_TOKEN / TELEGRAM_BOT_TOKEN is not set, /auth/login will answer 500" << std::endl;

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
                    try
                    {
                        task();
                    }
                    catch (const std::exception& e)
                    {
                        std::cerr << "[beast] session error: " << e.what() << std::endl;
                    }
                }
            });
        }

        std::cout << "[beast] server starting on 0.0.0.0:" << port << " with " << cores
                  << " worker thread(s)" << std::endl;

        for (;;)
        {
            std::shared_ptr<tcp::socket> socket = std::make_shared<tcp::socket>(ioc);
            beast::error_code ec;
            acceptor.accept(*socket, ec);
            if (ec)
            {
                std::cerr << "[beast] accept failed: " << ec.message() << std::endl;
                std::this_thread::sleep_for(std::chrono::milliseconds(50));
                continue;
            }
            queue.enqueue([socket] { do_session(*socket); });
        }
    }
    catch (const std::exception& e)
    {
        std::cerr << "[beast] fatal: " << e.what() << std::endl;
        return 1;
    }
}
