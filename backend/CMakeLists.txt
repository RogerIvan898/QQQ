cmake_minimum_required(VERSION 3.16)
project(poker_backend LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(Boost REQUIRED COMPONENTS json system)
find_package(OpenSSL REQUIRED)

add_executable(poker_backend src/main.cpp src/telegram_auth.hpp)

target_compile_features(poker_backend PRIVATE cxx_std_20)
target_link_libraries(poker_backend PRIVATE
    Boost::json
    Boost::system
    OpenSSL::SSL
    OpenSSL::Crypto
)

if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    target_compile_options(poker_backend PRIVATE -Wall -Wextra -Wpedantic)
endif()
