{
  "targets": [
     {
      "target_name": "jobIngestion",
      "sources": [ "cpp/jobIngestion.cc" ],
      "include_dirs": [
        "<!(node -e \"require('node-addon-api').include_dir\")",
        "cpp/external/include",
        "/usr/local/include/mongocxx/v_noabi",
        "/usr/local/include/bsoncxx/v_noabi"
      ],
      "libraries": [
        "-lmongocxx",
        "-lbsoncxx",
        "-lcurl",
        "-lexpat",
        "-lz"
      ],
      "cflags_cc": [
        "-std=gnu++17"
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "defines!": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LIBRARY": "libc++"
      },
      "msvs_settings": {
        "VCCLCompilerTool": { "ExceptionHandling": 1 }
      }
    }
  ]
}