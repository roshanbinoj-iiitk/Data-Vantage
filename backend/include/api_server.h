#pragma once

#include <string>
#include <memory>

class ApiServer
{
public:
    ApiServer(const std::string &host = "0.0.0.0", int port = 8000, const std::string &web_root = "");
    ~ApiServer();

    void start();
    void stop();

private:
    struct Impl;
    std::unique_ptr<Impl> m_impl;
};
