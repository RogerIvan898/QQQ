# Backend: C++20 poker server (Boost.Beast/Asio, Boost.Json, OpenSSL), built with CMake + Make.
# Build:  docker build -t poker-backend backend/
# Run:    docker run -p 8080:8080 -e BOT_TOKEN poker-backend
#
# The listening port comes from $PORT (set by hosting platforms), default 8080.
# BOT_TOKEN and ALLOWED_ORIGINS are runtime settings: never bake them into the image.

FROM debian:trixie

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    libboost-dev \
    libboost-json-dev \
    libboost-system-dev \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN cmake -S . -B build -G "Unix Makefiles" -DCMAKE_BUILD_TYPE=Release \
    && cmake --build build -j

EXPOSE 8080
CMD ["/app/build/poker_backend"]
