cmake_minimum_required(VERSION 3.16)
project(DataVantage VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()

option(ENABLE_NATIVE_OPT "Enable -march=native" OFF)
option(USE_SYSTEM_HTTPLIB "Use system-installed cpp-httplib" OFF)
option(USE_SYSTEM_JSON "Use system-installed nlohmann/json" OFF)
option(USE_SYSTEM_XXHASH "Use system-installed xxHash headers" OFF)
option(DV_BUILD_TESTS "Build unit tests (fetches Catch2)" OFF)
set(DV_SANITIZE "" CACHE STRING "Sanitizer to build with: address, thread, undefined or empty")

if(ENABLE_NATIVE_OPT)
    add_compile_options(-march=native)
endif()

if(DV_SANITIZE)
    add_compile_options(-fsanitize=${DV_SANITIZE} -fno-omit-frame-pointer -g)
    add_link_options(-fsanitize=${DV_SANITIZE})
endif()

# ---- Dependencies ----
include(FetchContent)
set(FETCHCONTENT_QUIET ON)

if(USE_SYSTEM_HTTPLIB)
    find_package(httplib CONFIG REQUIRED)
    set(DV_HTTPLIB httplib::httplib)
else()
    FetchContent_Declare(httplib
        URL https://github.com/yhirose/cpp-httplib/archive/refs/tags/v0.15.3.tar.gz
        DOWNLOAD_EXTRACT_TIMESTAMP ON)
    FetchContent_GetProperties(httplib)
    if(NOT httplib_POPULATED)
        FetchContent_Populate(httplib) # header-only: no need to build its CMake project
    endif()
    add_library(dv_httplib INTERFACE)
    target_include_directories(dv_httplib SYSTEM INTERFACE ${httplib_SOURCE_DIR})
    set(DV_HTTPLIB dv_httplib)
endif()

if(USE_SYSTEM_JSON)
    find_package(nlohmann_json 3.10 CONFIG REQUIRED)
else()
    FetchContent_Declare(nlohmann_json
        URL https://github.com/nlohmann/json/archive/refs/tags/v3.11.3.tar.gz
        DOWNLOAD_EXTRACT_TIMESTAMP ON)
    FetchContent_MakeAvailable(nlohmann_json)
endif()

add_library(dv_xxhash INTERFACE)
if(USE_SYSTEM_XXHASH)
    find_path(XXHASH_INCLUDE_DIR xxhash.h REQUIRED)
    target_include_directories(dv_xxhash SYSTEM INTERFACE ${XXHASH_INCLUDE_DIR})
else()
    FetchContent_Declare(xxhash
        URL https://github.com/Cyan4973/xxHash/archive/refs/tags/v0.8.2.tar.gz
        DOWNLOAD_EXTRACT_TIMESTAMP ON)
    FetchContent_GetProperties(xxhash)
    if(NOT xxhash_POPULATED)
        FetchContent_Populate(xxhash) # only xxhash.h is used (XXH_INLINE_ALL)
    endif()
    target_include_directories(dv_xxhash SYSTEM INTERFACE ${xxhash_SOURCE_DIR})
endif()

find_package(SQLite3 REQUIRED)
find_package(Threads REQUIRED)

# ---- Core library (everything except main) ----
add_library(dv_core STATIC
    src/api_server.cpp
    src/database.cpp
    src/exclusions.cpp
    src/file_actions.cpp
    src/hasher.cpp
    src/json_api.cpp
    src/paths.cpp
    src/scan_job.cpp
    src/scanner.cpp
    src/trash.cpp
)
target_include_directories(dv_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)
target_link_libraries(dv_core PUBLIC
    SQLite::SQLite3
    nlohmann_json::nlohmann_json
    Threads::Threads
    PRIVATE ${DV_HTTPLIB} dv_xxhash)
target_compile_options(dv_core PRIVATE -Wall -Wextra -Wpedantic)

add_executable(data-vantage src/main.cpp)
target_link_libraries(data-vantage PRIVATE dv_core)
target_compile_options(data-vantage PRIVATE -Wall -Wextra -Wpedantic)

install(TARGETS data-vantage DESTINATION bin)

# ---- Tests ----
if(DV_BUILD_TESTS)
    FetchContent_Declare(Catch2
        URL https://github.com/catchorg/Catch2/archive/refs/tags/v3.7.1.tar.gz
        DOWNLOAD_EXTRACT_TIMESTAMP ON)
    FetchContent_MakeAvailable(Catch2)

    add_executable(dv_tests
        tests/test_database.cpp
        tests/test_exclusions.cpp
        tests/test_hasher.cpp
        tests/test_scanner.cpp
        tests/test_trash.cpp
    )
    target_link_libraries(dv_tests PRIVATE dv_core Catch2::Catch2WithMain)
    target_compile_options(dv_tests PRIVATE -Wall -Wextra)

    include(CTest)
    list(APPEND CMAKE_MODULE_PATH ${catch2_SOURCE_DIR}/extras)
    include(Catch)
    catch_discover_tests(dv_tests)
endif()

message(STATUS "Data-Vantage: build type ${CMAKE_BUILD_TYPE}, tests ${DV_BUILD_TESTS}, sanitizer '${DV_SANITIZE}'")
