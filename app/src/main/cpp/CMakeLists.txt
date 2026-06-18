cmake_minimum_required(VERSION 3.22.1)
project(pippty)

add_library(pippty SHARED pty.c)

find_library(log-lib log)
target_link_libraries(pippty ${log-lib})
