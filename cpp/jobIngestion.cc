#include <napi.h>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <deque>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>
 
// External library headers
#include <curl/curl.h>
#include <expat.h>
#include <zlib.h>
#include <iostream>

// MongoDB C++ Driver headers
#include <bsoncxx/builder/stream/document.hpp>
#include <bsoncxx/json.hpp>
#include <mongocxx/client.hpp>
#include <bsoncxx/document/view.hpp>
#include <mongocxx/instance.hpp>
#include <mongocxx/uri.hpp>
#include <mongocxx/pool.hpp>
#include <mongocxx/options/bulk_write.hpp>
#include <mongocxx/exception/bulk_write_exception.hpp> // For catching bulk write errors
#include <mongocxx/model/insert_one.hpp> // Required for mongocxx::model::insert_one

// --- Thread-Safe Queue for Jobs ---
using JobDocument = bsoncxx::document::value;

class JobQueue {
public:
    void push(JobDocument doc) {
        std::unique_lock<std::mutex> lock(_mutex);
        _queue.push_back(std::move(doc));
        _cond.notify_one();
    }

    bool pop(JobDocument& doc, int timeout_ms) {
        std::unique_lock<std::mutex> lock(_mutex);
        if (_cond.wait_for(lock, std::chrono::milliseconds(timeout_ms), [this] { return !_queue.empty() || _done; })) {
            if (!_queue.empty()) {
                doc = std::move(_queue.front());
                _queue.pop_front();
                return true;
            }
        }
        return false;
    }

    void done() {
        std::unique_lock<std::mutex> lock(_mutex);
        _done = true;
        _cond.notify_all();
    }

private:
    std::deque<JobDocument> _queue;
    std::mutex _mutex;
    std::condition_variable _cond;
    bool _done = false;
};

// --- MongoDB Worker ---
void mongoWorker(
    mongocxx::pool* pool,
    JobQueue* queue,
    std::atomic<long>* insertedCount,
    std::atomic<long>* failedCount) {

    // --- Hardcoded Database Details ---
    const std::string DB_NAME = "job-distribution";
    const std::string COLL_NAME = "jobs";
    const size_t MONGO_BATCH_SIZE = 1000;

    try {
        auto client = pool->acquire();
        auto collection = (*client)[DB_NAME][COLL_NAME];

        std::vector<bsoncxx::document::value> batch_storage;
        batch_storage.reserve(MONGO_BATCH_SIZE);

        JobDocument doc(bsoncxx::builder::stream::document{} << bsoncxx::builder::stream::finalize);

        auto insert_batch = [&]() {
            if (batch_storage.empty()) return;
            
            // Use bulk_write for ordered(false) behavior
            mongocxx::options::bulk_write bulk_opts;
            bulk_opts.ordered(false); // CRITICAL: Continue inserting even if one fails

            mongocxx::bulk_write bulk = collection.create_bulk_write(bulk_opts);

            for(const auto& d : batch_storage) {
                bulk.append(mongocxx::model::insert_one(d.view()));
            }

            try {
                // Execute the bulk write operation
                auto result = bulk.execute();
                if (result) {
                    (*insertedCount) += result->inserted_count();
                }
            } catch (const mongocxx::bulk_write_exception& e) {
                // This logic is for older versions of the MongoDB C++ driver (e.g., 3.1.x)
                // where the exception contains a BSON document with the results. We try to
                // access it via raw_server_error(), which is more fundamental than result().
                try {
                    auto maybe_result_view = e.raw_server_error();
                    if (maybe_result_view) {
                        bsoncxx::document::view result_view = *maybe_result_view;
                        
                        long success_count = 0;
                        if (result_view["nInserted"] && (result_view["nInserted"].type() == bsoncxx::type::k_int32 || result_view["nInserted"].type() == bsoncxx::type::k_int64)) {
                            success_count = result_view["nInserted"].get_int64().value;
                        }

                        long error_count = 0;
                        if (result_view["writeErrors"] && result_view["writeErrors"].type() == bsoncxx::type::k_array) {
                            bsoncxx::array::view errors_array = result_view["writeErrors"].get_array().value;
                            error_count = std::distance(errors_array.begin(), errors_array.end());
                        }

                        (*insertedCount) += success_count;
                        (*failedCount) += error_count;

                        // If counts don't add up, assume the rest failed.
                        long unaccounted = batch_storage.size() - (success_count + error_count);
                        if (unaccounted > 0) (*failedCount) += unaccounted;
                    } else {
                        // If there's no result document, we have to assume all failed.
                        std::cerr << "MongoDB bulk_write_exception with no result document: " << e.what() << ". Assuming all in batch failed." << std::endl;
                        (*failedCount) += batch_storage.size();
                    }
                } catch (const std::exception& parse_e) {
                    std::cerr << "Could not parse bulk_write_exception result: " << parse_e.what() << ". Assuming all in batch failed." << std::endl;
                    (*failedCount) += batch_storage.size();
                }
            } catch (const std::exception& e) {
                std::cerr << "MongoDB worker exception: " << e.what() << std::endl;
                (*failedCount) += batch_storage.size();
            }
            batch_storage.clear();
        };

        while (queue->pop(doc, 200)) {
            batch_storage.push_back(std::move(doc));
            if (batch_storage.size() >= MONGO_BATCH_SIZE) {
                insert_batch();
            }
        }

        insert_batch(); // Insert any remaining documents
    } catch (const std::exception& e) {
        std::cerr << "Error in mongoWorker setup: " << e.what() << std::endl;
    }
}

// --- XML Parser State & Handlers ---
const std::string JOB_CONTAINER_TAG = "job";

struct ParserContext {
    JobQueue* queue;
    const std::unordered_map<std::string, std::string>* node_mapping;
    std::string clientId;
    std::unordered_map<std::string, std::string> current_job_data;
    std::string current_element_name;
    std::string current_text;
    bool in_job_element = false;
};

static void XMLCALL startElement(void *userData, const XML_Char *name, const XML_Char **attrs) {
    ParserContext* context = static_cast<ParserContext*>(userData);
    std::string tagName(name);
    if (tagName == JOB_CONTAINER_TAG) {
        context->in_job_element = true;
        context->current_job_data.clear();
    } else if (context->in_job_element) {
        context->current_element_name = tagName;
        context->current_text.clear();
    }
}

static void XMLCALL endElement(void *userData, const XML_Char *name) {
    ParserContext* context = static_cast<ParserContext*>(userData);
    std::string tagName(name);
    if (tagName == JOB_CONTAINER_TAG) {
        if (!context->current_job_data.empty()) {
            bsoncxx::builder::stream::document builder{};
            builder << "feed_id" << bsoncxx::oid(context->clientId);

            bsoncxx::builder::stream::document mapped_fields_builder{};
            for (const auto& pair : context->current_job_data) {
                auto it = context->node_mapping->find(pair.first);
                if (it != context->node_mapping->end()) {
                    mapped_fields_builder << it->second << pair.second;
                }
            }
            builder << "mapped_fields" << mapped_fields_builder;

            context->queue->push(builder << bsoncxx::builder::stream::finalize);
        }
        context->in_job_element = false;
    } else if (context->in_job_element && tagName == context->current_element_name) {
        if (context->node_mapping->count(tagName)) {
            context->current_job_data[tagName] = context->current_text;
        }
    }
    context->current_element_name.clear();
}

static void XMLCALL characterData(void *userData, const XML_Char *s, int len) {
    ParserContext* context = static_cast<ParserContext*>(userData);
    if (!context->current_element_name.empty()) {
        context->current_text.append(s, len);
    }
}

// Decompresses a Gzip-compressed string using zlib.
std::string GzipDecompress(const std::string& compressed_data) {
    z_stream zs;
    memset(&zs, 0, sizeof(zs));

    // The `16 + MAX_WBITS` enables gzip decompression.
    if (inflateInit2(&zs, 16 + MAX_WBITS) != Z_OK) {
        throw std::runtime_error("inflateInit failed for gzip");
    }

    zs.next_in = (Bytef*)compressed_data.data();
    zs.avail_in = compressed_data.size();

    int ret;
    char outbuffer[32768];
    std::string decompressed_data;

    do {
        zs.next_out = (Bytef*)outbuffer;
        zs.avail_out = sizeof(outbuffer);

        ret = inflate(&zs, Z_NO_FLUSH);

        if (decompressed_data.size() < zs.total_out) {
            decompressed_data.append(outbuffer, zs.total_out - decompressed_data.size());
        }

    } while (ret == Z_OK);

    inflateEnd(&zs);

    if (ret != Z_STREAM_END) { // Gzip stream is incomplete or corrupt
        throw std::runtime_error("Gzip decompression failed: The stream was incomplete or corrupt.");
    }

    return decompressed_data;
}

// Callback for libcurl to write data into a std::string
static size_t DownloadToStringCallback(void* contents, size_t size, size_t nmemb, void* userp) {
    ((std::string*)userp)->append((char*)contents, size * nmemb);
    return size * nmemb;
}

// --- N-API Addon ---
mongocxx::instance instance{};

Napi::Value ingestJobsFromUrl(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    auto t0 = std::chrono::high_resolution_clock::now();

    if (info.Length() < 4 || !info[0].IsString() || !info[1].IsString() || !info[2].IsArray() || !info[3].IsString()) {
        Napi::TypeError::New(env, "Expected (String feed_url, String mongo_uri, Array node_mapping, String clientId)").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string url = info[0].As<Napi::String>().Utf8Value();
    std::string mongo_uri_str = info[1].As<Napi::String>().Utf8Value();
    Napi::Array mapping_array = info[2].As<Napi::Array>();
    std::string clientId = info[3].As<Napi::String>().Utf8Value();

    std::unordered_map<std::string, std::string> node_mapping;
    for (uint32_t i = 0; i < mapping_array.Length(); i++) {
        Napi::Object mapping_obj = mapping_array.Get(i).As<Napi::Object>();
        node_mapping[mapping_obj.Get("client_node").As<Napi::String>()] = mapping_obj.Get("internal_field").As<Napi::String>();
    }

    // --- 1. Download Data ---
    CURL* curl_handle;
    CURLcode res;
    std::string downloaded_data;
    char errbuff[CURL_ERROR_SIZE] = {0};

    curl_global_init(CURL_GLOBAL_DEFAULT);
    curl_handle = curl_easy_init();
    if (!curl_handle) {
        curl_global_cleanup();
        Napi::Error::New(env, "cURL init failed").ThrowAsJavaScriptException();
        return env.Null();
    }

    curl_easy_setopt(curl_handle, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl_handle, CURLOPT_WRITEFUNCTION, DownloadToStringCallback);
    curl_easy_setopt(curl_handle, CURLOPT_WRITEDATA, &downloaded_data);
    curl_easy_setopt(curl_handle, CURLOPT_FOLLOWLOCATION, 1L);
    curl_easy_setopt(curl_handle, CURLOPT_USERAGENT, "xml-ingestion-addon/1.0");
    curl_easy_setopt(curl_handle, CURLOPT_FAILONERROR, 1L);
    curl_easy_setopt(curl_handle, CURLOPT_ERRORBUFFER, errbuff);

    res = curl_easy_perform(curl_handle);
    curl_easy_cleanup(curl_handle);

    if (res != CURLE_OK) {
        std::string error_msg = "cURL failed: " + std::string(curl_easy_strerror(res)) + " - " + std::string(errbuff);
        Napi::Error::New(env, error_msg).ThrowAsJavaScriptException();
        return env.Null();
    }

    // --- 2. Decompress if Necessary ---
    std::string xmlContent;
    bool is_gzipped = url.size() > 3 && url.substr(url.size() - 3) == ".gz";

    if (is_gzipped) {
        try {
            xmlContent = GzipDecompress(downloaded_data);
        } catch (const std::runtime_error& e) {
            Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
            return env.Null();
        }
    } else {
        xmlContent = downloaded_data;
    }

    // --- 3. Parse XML and Ingest to DB ---
    const int NUM_THREADS = 4;
    long total_processed = 0;
    std::atomic<long> insertedCount(0);
    std::atomic<long> failedCount(0);

    try {
        mongocxx::uri uri(mongo_uri_str);
        mongocxx::pool pool(uri);

        JobQueue queue;
        std::vector<std::thread> workers;

        ParserContext parser_context;
        parser_context.queue = &queue;
        parser_context.node_mapping = &node_mapping;
        parser_context.clientId = clientId;

        XML_Parser parser = XML_ParserCreate(NULL);
        XML_SetUserData(parser, &parser_context);
        XML_SetElementHandler(parser, startElement, endElement);
        XML_SetCharacterDataHandler(parser, characterData);

        for (int i = 0; i < NUM_THREADS; ++i) {
            workers.emplace_back(mongoWorker, &pool, &queue, &insertedCount, &failedCount);
        }

        if (XML_Parse(parser, xmlContent.c_str(), xmlContent.length(), 1) == XML_STATUS_ERROR) {
            char error_string[1024];
            sprintf(error_string, "XML_Parse error at line %lu: %s",
                    XML_GetCurrentLineNumber(parser),
                    XML_ErrorString(XML_GetErrorCode(parser)));
            XML_ParserFree(parser);
            // Ensure threads are cleaned up even on error
            queue.done();
            for (auto& worker : workers) {
                if (worker.joinable()) worker.join();
            }
            Napi::Error::New(env, error_string).ThrowAsJavaScriptException();
            return env.Null();
        }

        XML_ParserFree(parser);
        queue.done();
        for (auto& worker : workers) {
            if (worker.joinable()) worker.join();
        }

    } catch (const std::exception& e) {
        Napi::Error::New(env, "Database or parsing setup error: " + std::string(e.what())).ThrowAsJavaScriptException();
        return env.Null();
    }

    auto t1 = std::chrono::high_resolution_clock::now();
    double secs = std::chrono::duration<double>(t1 - t0).count();

    total_processed = insertedCount + failedCount;

    Napi::Object result = Napi::Object::New(env);
    result.Set("totalProcessed", Napi::Number::New(env, total_processed));
    result.Set("inserted", Napi::Number::New(env, (long)insertedCount));
    result.Set("failed", Napi::Number::New(env, (long)failedCount));
    result.Set("duration_s", Napi::Number::New(env, secs));

    return result;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    // curl_global_init() should be called once for the entire process.
    // The addon's Init function is a good place for this.
    // We don't call curl_global_cleanup() as it's not strictly necessary on
    // modern OSes and can be tricky to time correctly in a Node.js addon.
    curl_global_init(CURL_GLOBAL_DEFAULT);
    exports.Set("ingestJobsFromUrl", Napi::Function::New(env, ingestJobsFromUrl));
    return exports;
}

NODE_API_MODULE(jobsIngestion, Init)