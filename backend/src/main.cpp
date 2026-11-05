#include "api_server.h"

#include <csignal>
#include <cstdlib>
#include <iostream>
#include <memory>
#include <string>

namespace
{
    ApiServer *g_server = nullptr;

    void signal_handler(int)
    {
        if (g_server)
            g_server->stop();
    }

    void usage()
    {
        std::cout << "Data-Vantage backend server\n"
                  << "Usage: data-vantage [options]\n"
                  << "  --host, -h HOST      Address to bind (default: 127.0.0.1)\n"
                  << "  --port, -p PORT      Port to listen on (default: 8000)\n"
                  << "  --web-root DIR       Serve the frontend from DIR\n"
                  << "                       (default: /usr/share/data-vantage/web)\n"
                  << "  --db FILE            Database file\n"
                  << "                       (default: $XDG_DATA_HOME/data-vantage/data_vantage.db)\n"
                  << "  --token-file FILE    Where to write the API token for the dev server\n"
                  << "                       (default: $XDG_RUNTIME_DIR/data-vantage/token)\n"
                  << "  --hash-threads N     Threads used for hashing (default: automatic)\n"
                  << "  --help               Show this help\n";
    }
} // namespace

int main(int argc, char *argv[])
{
    ServerConfig config;
    config.web_root = "/usr/share/data-vantage/web";

    for (int i = 1; i < argc; i++)
    {
        const std::string arg = argv[i];
        const bool has_value = i + 1 < argc;
        try
        {
            if ((arg == "--port" || arg == "-p") && has_value)
                config.port = std::stoi(argv[++i]);
            else if ((arg == "--host" || arg == "-h") && has_value)
                config.host = argv[++i];
            else if (arg == "--web-root" && has_value)
                config.web_root = argv[++i];
            else if (arg == "--db" && has_value)
                config.db_path = argv[++i];
            else if (arg == "--token-file" && has_value)
                config.token_file = argv[++i];
            else if (arg == "--hash-threads" && has_value)
                config.hash_threads = static_cast<unsigned>(std::stoul(argv[++i]));
            else if (arg == "--help")
            {
                usage();
                return 0;
            }
            else
            {
                std::cerr << "Unknown or incomplete option: " << arg << "\n";
                usage();
                return 2;
            }
        }
        catch (const std::exception &)
        {
            std::cerr << "Invalid value for " << arg << "\n";
            return 2;
        }
    }

    std::signal(SIGINT, signal_handler);
    std::signal(SIGTERM, signal_handler);
    std::signal(SIGPIPE, SIG_IGN); // a closed socket must not kill the server

    try
    {
        auto server = std::make_unique<ApiServer>(config);
        g_server = server.get();
        server->start();
        g_server = nullptr;
        std::cout << "Shutting down Data-Vantage..." << std::endl;
        server.reset(); // cancels running scans and waits for them
    }
    catch (const std::exception &e)
    {
        std::cerr << "Fatal error: " << e.what() << std::endl;
        return 1;
    }
    return 0;
}
