#include "api_server.h"
#include <iostream>
#include <csignal>
#include <memory>

std::unique_ptr<ApiServer> g_server;

void signal_handler(int)
{
    std::cout << "\nShutting down Data-Vantage server..." << std::endl;
    if (g_server)
    {
        g_server->stop();
    }
}

int main(int argc, char *argv[])
{
    std::string host = "0.0.0.0";
    int port = 8000;

    // Parse command line args
    for (int i = 1; i < argc; i++)
    {
        std::string arg = argv[i];
        if ((arg == "--port" || arg == "-p") && i + 1 < argc)
        {
            port = std::stoi(argv[++i]);
        }
        else if ((arg == "--host" || arg == "-h") && i + 1 < argc)
        {
            host = argv[++i];
        }
        else if (arg == "--help")
        {
            std::cout << "Data-Vantage Backend Server\n"
                      << "Usage: data-vantage [options]\n"
                      << "  --host, -h  Host to bind (default: 0.0.0.0)\n"
                      << "  --port, -p  Port to listen on (default: 8080)\n"
                      << "  --help      Show this help\n";
            return 0;
        }
    }

    std::signal(SIGINT, signal_handler);
    std::signal(SIGTERM, signal_handler);

    try
    {
        g_server = std::make_unique<ApiServer>(host, port);
        g_server->start();
    }
    catch (const std::exception &e)
    {
        std::cerr << "Fatal error: " << e.what() << std::endl;
        return 1;
    }

    return 0;
}
