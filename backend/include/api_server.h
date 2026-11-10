#pragma once

#include <memory>
#include <string>

struct ServerConfig
{
    std::string host = "127.0.0.1";
    int port = 8000;
    std::string web_root;   // serve the frontend from here ("" = API only)
    std::string db_path;    // "" = $XDG_DATA_HOME/data-vantage/data_vantage.db
    std::string token;      // "" = generate a random one
    std::string token_file; // "" = $XDG_RUNTIME_DIR/data-vantage/token
    unsigned hash_threads = 0;
    bool open_browser = false; // open the web UI once the port is bound
};

class ApiServer
{
  public:
    explicit ApiServer(const ServerConfig &config);
    ~ApiServer(); // cancels running scans and waits for them

    // Blocks until stop() is called.
    void start();
    // Stops accepting requests. Safe to call from a signal handler context
    // in the sense that it only flips the listener's state.
    void stop();

    const std::string &token() const;

  private:
    struct Impl;
    std::unique_ptr<Impl> m_impl;
};

// True for 127.0.0.1, ::1, localhost and similar loopback names.
bool is_loopback_host(const std::string &host);
// True if a request's Host header names this loopback server.
bool host_header_allowed(const std::string &host_header, int port);
