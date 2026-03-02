cmake_minimum_required(VERSION 3.16)
project(DataVantage VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Optimization flags
if(CMAKE_BUILD_TYPE STREQUAL "Release")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O3 -march=native")
endif()

# ---- Dependencies ----

# Fetch cpp-httplib (header-only HTTP library)
include(FetchContent)

FetchContent_Declare(
    httplib
    GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
    GIT_TAG v0.15.3
)
FetchContent_MakeAvailable(httplib)

# Find SQLite3
find_package(SQLite3 REQUIRED)

# ---- Sources ----
set(SOURCES
    src/main.cpp
    src/scanner.cpp
    src/hasher.cpp
    src/database.cpp
    src/api_server.cpp
)

# ---- Executable ----
add_executable(data-vantage ${SOURCES})

target_include_directories(data-vantage PRIVATE
    ${CMAKE_SOURCE_DIR}/include
    ${httplib_SOURCE_DIR}
    ${SQLite3_INCLUDE_DIRS}
)

target_link_libraries(data-vantage PRIVATE
    ${SQLite3_LIBRARIES}
    pthread
)

# Install
install(TARGETS data-vantage DESTINATION bin)

# ---- Print config ----
message(STATUS "Data-Vantage build configuration:")
message(STATUS "  C++ Standard: ${CMAKE_CXX_STANDARD}")
message(STATUS "  Build type: ${CMAKE_BUILD_TYPE}")
message(STATUS "  SQLite3: ${SQLite3_LIBRARIES}")
