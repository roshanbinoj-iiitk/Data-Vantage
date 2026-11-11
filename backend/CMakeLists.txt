cmake_minimum_required(VERSION 3.16)
project(DataVantage VERSION 1.1.1 LANGUAGES CXX)

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
option(DV_BUNDLED_SQLITE "Build SQLite from source into the binary instead of using the system library" OFF)
option(DV_BUILD_TESTS "Build unit tests (fetches Catch2)" OFF)
set(DV_WEB_DIST "" CACHE PATH "Built frontend (frontend/dist) to install into share/data-vantage/web")
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

find_package(Threads REQUIRED)

# Release packages bundle SQLite: the search index needs 3.43+
# (contentless_delete), newer than many distributions ship (Ubuntu 22.04 has
# 3.37), and a database written by a newer SQLite must open in every build.
if(DV_BUNDLED_SQLITE)
    enable_language(C) # sqlite3.c
    FetchContent_Declare(sqlite
        URL https://www.sqlite.org/2026/sqlite-amalgamation-3540100.zip
        URL_HASH SHA3_256=92281c86e2957f9b9305890f9ac04204caa7b677cc868dc326d942689df28e30
        DOWNLOAD_EXTRACT_TIMESTAMP ON)
    FetchContent_MakeAvailable(sqlite) # no CMakeLists.txt inside: just unpacks
    add_library(dv_sqlite STATIC ${sqlite_SOURCE_DIR}/sqlite3.c)
    target_include_directories(dv_sqlite SYSTEM PUBLIC ${sqlite_SOURCE_DIR})
    target_compile_definitions(dv_sqlite PRIVATE
        SQLITE_ENABLE_FTS5
        SQLITE_THREADSAFE=1
        SQLITE_DQS=0
        SQLITE_OMIT_LOAD_EXTENSION)
    set_target_properties(dv_sqlite PROPERTIES POSITION_INDEPENDENT_CODE ON)
    target_link_libraries(dv_sqlite PUBLIC Threads::Threads m)
    set(DV_SQLITE dv_sqlite)
else()
    find_package(SQLite3 REQUIRED)
    set(DV_SQLITE SQLite::SQLite3)
endif()

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
    ${DV_SQLITE}
    nlohmann_json::nlohmann_json
    Threads::Threads
    PRIVATE ${DV_HTTPLIB} dv_xxhash)
target_compile_options(dv_core PRIVATE -Wall -Wextra -Wpedantic)

add_executable(data-vantage src/main.cpp)
target_link_libraries(data-vantage PRIVATE dv_core)
target_compile_options(data-vantage PRIVATE -Wall -Wextra -Wpedantic)

install(TARGETS data-vantage DESTINATION bin)

# ---- Desktop integration and packages ----
set(DV_PACKAGING_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../packaging/linux)
install(FILES ${DV_PACKAGING_DIR}/data-vantage.desktop DESTINATION share/applications)
install(FILES ${DV_PACKAGING_DIR}/data-vantage.svg DESTINATION share/icons/hicolor/scalable/apps)
install(FILES ${DV_PACKAGING_DIR}/data-vantage.png DESTINATION share/icons/hicolor/256x256/apps)
if(DV_WEB_DIST)
    if(NOT EXISTS ${DV_WEB_DIST}/index.html)
        message(FATAL_ERROR "DV_WEB_DIST=${DV_WEB_DIST} has no index.html; build the frontend first")
    endif()
    install(DIRECTORY ${DV_WEB_DIST}/ DESTINATION share/data-vantage/web)
endif()

# `cpack -G DEB` builds a .deb (see packaging/build-packages.sh).
set(CPACK_PACKAGE_NAME data-vantage)
set(CPACK_PACKAGE_VENDOR "Roshan Binoj")
set(CPACK_PACKAGE_CONTACT "Roshan Binoj <roshanbinoj-iiitk@users.noreply.github.com>")
set(CPACK_PACKAGE_DESCRIPTION_SUMMARY "Disk usage analyzer and duplicate file finder with a web UI")
set(CPACK_PACKAGE_DESCRIPTION
    "Scans folders, shows where disk space goes in an interactive chart and finds duplicate files. Copies are compared byte by byte and moved to the desktop Trash, never deleted permanently.")
set(CPACK_RESOURCE_FILE_LICENSE ${CMAKE_CURRENT_SOURCE_DIR}/../LICENSE)
set(CPACK_PACKAGING_INSTALL_PREFIX /usr)
set(CPACK_DEBIAN_FILE_NAME DEB-DEFAULT)
set(CPACK_DEBIAN_PACKAGE_SECTION utils)
set(CPACK_DEBIAN_PACKAGE_HOMEPAGE "https://github.com/roshanbinoj-iiitk/Data-Vantage")
set(CPACK_DEBIAN_PACKAGE_SHLIBDEPS ON)
if(NOT DV_BUNDLED_SQLITE)
    # Search uses the FTS5 trigram tokenizer with contentless_delete (3.43).
    set(CPACK_DEBIAN_PACKAGE_DEPENDS "libsqlite3-0 (>= 3.43)")
endif()
# CPack asks dpkg for the architecture; name it when dpkg isn't installed.
find_program(DV_DPKG dpkg)
if(NOT DV_DPKG)
    if(CMAKE_SYSTEM_PROCESSOR MATCHES "^(x86_64|AMD64)$")
        set(CPACK_DEBIAN_PACKAGE_ARCHITECTURE amd64)
    elseif(CMAKE_SYSTEM_PROCESSOR MATCHES "^(aarch64|arm64)$")
        set(CPACK_DEBIAN_PACKAGE_ARCHITECTURE arm64)
    endif()
endif()
set(CPACK_DEBIAN_PACKAGE_RECOMMENDS "xdg-utils")
set(CPACK_DEBIAN_PACKAGE_SUGGESTS "zenity | kdialog")
include(CPack)

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
