// Verification of Telegram Mini App "initData" (the string from Telegram.WebApp.initData).
//
// Depends only on the C++ standard library and OpenSSL, so it can be unit-tested
// without Boost. Algorithm (https://core.telegram.org/bots/webapps):
//   1. Split initData into key=value pairs and URL-decode them.
//   2. Take out "hash", sort the rest by key, join as "key=value" with '\n'.
//   3. secret_key = HMAC_SHA256(key = "WebAppData", msg = bot_token)   (raw bytes)
//   4. expected   = hex(HMAC_SHA256(key = secret_key, msg = data_check_string))
//   5. Compare with "hash" in constant time, then check that auth_date is fresh.
#pragma once

#include <openssl/evp.h>
#include <openssl/hmac.h>

#include <algorithm>
#include <cstdlib>
#include <string>
#include <utility>
#include <vector>

namespace tgauth {

struct Result
{
    bool ok = false;
    std::string error;      // short machine-readable reason, set when ok == false
    std::string user_json;  // decoded JSON of the "user" field (empty if absent)
    long long auth_date = 0;
};

namespace detail {

using Pairs = std::vector<std::pair<std::string, std::string>>;

inline int hex_val(char c)
{
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

// Query-string decoding: %XX and '+' (as space), like URLSearchParams.
inline bool url_decode(const std::string& in, std::string& out)
{
    out.clear();
    out.reserve(in.size());
    for (size_t i = 0; i < in.size(); ++i)
    {
        char c = in[i];
        if (c == '+')
        {
            out.push_back(' ');
        }
        else if (c == '%')
        {
            if (i + 2 >= in.size())
                return false;
            int hi = hex_val(in[i + 1]);
            int lo = hex_val(in[i + 2]);
            if (hi < 0 || lo < 0)
                return false;
            out.push_back(static_cast<char>(hi * 16 + lo));
            i += 2;
        }
        else
        {
            out.push_back(c);
        }
    }
    return true;
}

inline bool parse_pairs(const std::string& raw, Pairs& out)
{
    size_t start = 0;
    while (start <= raw.size())
    {
        size_t amp = raw.find('&', start);
        size_t end = (amp == std::string::npos) ? raw.size() : amp;
        if (end > start)
        {
            std::string kv = raw.substr(start, end - start);
            size_t eq = kv.find('=');
            if (eq == std::string::npos)
                return false;
            std::string key, value;
            if (!url_decode(kv.substr(0, eq), key) || !url_decode(kv.substr(eq + 1), value))
                return false;
            out.emplace_back(std::move(key), std::move(value));
        }
        if (amp == std::string::npos)
            break;
        start = amp + 1;
    }
    return true;
}

// Raw (binary) HMAC-SHA256. Returns an empty string on failure.
inline std::string hmac_sha256(const std::string& key, const std::string& msg)
{
    unsigned char out[EVP_MAX_MD_SIZE];
    unsigned int out_len = 0;
    unsigned char* r = HMAC(
        EVP_sha256(),
        key.data(),
        static_cast<int>(key.size()),
        reinterpret_cast<const unsigned char*>(msg.data()),
        msg.size(),
        out,
        &out_len);
    if (r == nullptr)
        return std::string();
    return std::string(reinterpret_cast<const char*>(out), out_len);
}

inline std::string to_hex(const std::string& data)
{
    static const char digits[] = "0123456789abcdef";
    std::string out;
    out.reserve(data.size() * 2);
    for (unsigned char c : data)
    {
        out.push_back(digits[c >> 4]);
        out.push_back(digits[c & 0xf]);
    }
    return out;
}

inline bool ct_equal(const std::string& a, const std::string& b)
{
    if (a.size() != b.size())
        return false;
    unsigned char diff = 0;
    for (size_t i = 0; i < a.size(); ++i)
        diff |= static_cast<unsigned char>(a[i]) ^ static_cast<unsigned char>(b[i]);
    return diff == 0;
}

inline std::string data_check_string(const Pairs& sorted, bool include_signature)
{
    std::string s;
    for (const auto& p : sorted)
    {
        if (!include_signature && p.first == "signature")
            continue;
        if (!s.empty())
            s.push_back('\n');
        s += p.first;
        s.push_back('=');
        s += p.second;
    }
    return s;
}

} // namespace detail

// init_data:       raw string from Telegram.WebApp.initData
// bot_token:       token from @BotFather
// max_age_seconds: how old auth_date may be
// now:             current Unix time (a parameter so it can be tested)
inline Result verify(const std::string& init_data,
                     const std::string& bot_token,
                     long long max_age_seconds,
                     long long now)
{
    Result r;
    if (init_data.empty() || bot_token.empty())
    {
        r.error = "empty_input";
        return r;
    }

    detail::Pairs params;
    if (!detail::parse_pairs(init_data, params))
    {
        r.error = "malformed";
        return r;
    }

    std::string hash;
    bool hash_seen = false;
    detail::Pairs signed_params;
    for (auto& p : params)
    {
        if (p.first == "hash")
        {
            if (hash_seen)
            {
                r.error = "duplicate_hash";
                return r;
            }
            hash_seen = true;
            hash = p.second;
        }
        else
        {
            signed_params.push_back(std::move(p));
        }
    }
    if (hash.size() != 64)
    {
        r.error = "bad_hash";
        return r;
    }

    std::sort(signed_params.begin(), signed_params.end(),
              [](const std::pair<std::string, std::string>& a,
                 const std::pair<std::string, std::string>& b)
              { return a.first < b.first; });

    bool has_signature = false;
    for (size_t i = 0; i < signed_params.size(); ++i)
    {
        if (i > 0 && signed_params[i].first == signed_params[i - 1].first)
        {
            r.error = "duplicate_key";
            return r;
        }
        if (signed_params[i].first == "signature")
            has_signature = true;
    }

    std::string secret = detail::hmac_sha256("WebAppData", bot_token);
    if (secret.empty())
    {
        r.error = "crypto_error";
        return r;
    }

    // Newer Telegram clients add a "signature" field (used for third-party Ed25519
    // validation). The docs are not explicit about whether the "hash" HMAC covers it,
    // so accept either form. Both are keyed with the bot-token secret, so neither can
    // be forged without the token.
    bool match = detail::ct_equal(
        detail::to_hex(detail::hmac_sha256(secret, detail::data_check_string(signed_params, true))),
        hash);
    if (!match && has_signature)
    {
        match = detail::ct_equal(
            detail::to_hex(detail::hmac_sha256(secret, detail::data_check_string(signed_params, false))),
            hash);
    }
    if (!match)
    {
        r.error = "bad_signature";
        return r;
    }

    // Signature is valid; now check freshness.
    bool found_date = false;
    long long auth_date = 0;
    for (const auto& p : signed_params)
    {
        if (p.first == "auth_date")
        {
            const char* s = p.second.c_str();
            char* end = nullptr;
            auth_date = std::strtoll(s, &end, 10);
            if (end == s || *end != '\0')
            {
                r.error = "bad_auth_date";
                return r;
            }
            found_date = true;
        }
        else if (p.first == "user")
        {
            r.user_json = p.second;
        }
    }
    if (!found_date || auth_date <= 0)
    {
        r.error = "missing_auth_date";
        return r;
    }
    if (now - auth_date > max_age_seconds)
    {
        r.error = "expired";
        return r;
    }
    if (auth_date - now > 300)
    {
        r.error = "auth_date_in_future";
        return r;
    }

    r.ok = true;
    r.auth_date = auth_date;
    return r;
}

} // namespace tgauth
