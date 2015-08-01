'use strict';

var touch = require('touch'); // https://github.com/isaacs/node-touch
var chalk = require('chalk'); // https://github.com/sindresorhus/chalk
var mime = require('mime-types'); // https://www.npmjs.com/package/mime-types
var ytdl = require('youtube-dl'); // https://github.com/fent/node-youtube-dl
var http = require('follow-redirects').http; // https://www.npmjs.com/package/follow-redirects
var https = require('follow-redirects').https; // https://www.npmjs.com/package/follow-redirects

// Misc static helper functions.
function Helpers() {}

// Shorten a string to be less than a given length, ending in an ellipsis, trying to break on whole words.
Helpers.shortenString = function(s, len) {
    s = s.trim();

    if (!s) {
        return '';
    }

    if (s.length <= len) {
        return s;
    }

    while (s.length >= len) {
        if (s.indexOf(' ') === -1) {
            s = s.substring(0, len - 1);
            break;
        } else {
            s = s.substring(0, s.lastIndexOf(' '));
        }
    }

    s += '…';
    return s;
};

// Shorten a URL using the Google URL shortner API.
// https://developers.google.com/url-shortener/v1/
Helpers.shortenUrl = function(url, callback) {
    if (!url || !callback) {
        return;
    }

    Helpers.jsonRequest({
            url: 'https://www.googleapis.com/urlshortener/v1/url',
            method: 'POST',
            contentType: 'application/json',
            body: {
                longUrl: url
            },
            qs: {
                key: 'AIzaSyA0K_cjd5UE4j04KK8t_En_x_Y-razJIE8',
            },
        },
        function(result) {
            callback(result.id);
        },
        function() {
            callback(url);
        });
};

// Given a file path, try to write to it.
Helpers.validateFile = function(file, callback) {
    file = Helpers.cleanString(file);
    file = path.resolve(file);
    fs.mkdirp(path.dirname(file), function(err) {
        if (err) {
            callback(null);
            return;
        }

        touch(file, {}, function(err) {
            callback(err ? false : true);
        });
    });
};

// Given a file path, try to create a directory.
Helpers.validateDirectory = function(dir, callback) {
    dir = Helpers.cleanString(dir);
    dir = path.resolve(dir);
    fs.mkdirp(dir, function(err) {
        callback(err ? false : true);
    });
};

// Remove chalk stuff from a string.
Helpers.cleanString = function(s) {
    if (!s) {
        s = '';
    }
    return chalk.stripColor(s).trim();
};

Helpers.classNameFromFile = function(file) {
    return path.basename(file.replace('.js', ''));
};

// Make an HTTP request that expects JSON back, and handle the errors well.
Helpers.jsonRequest = function(options, callback, errorCallback) {
    if (!options) {
        options = {};
    }
    log.debug(JSON.stringify(options));
    options.json = true;
    if (process.argv.indexOf('proxy') !== -1) {
        options.proxy = 'http://localhost:8888';
        options.rejectUnauthorized = false;
    }
    request(options, function(err, response, body) {
        if (!err && (response.statusCode === 200 || response.statusCode === undefined)) {
            callback(body);
        } else {
            errorCallback(err || body);
        }
    });
};

// Given an URL, copy its contents to S3.
Helpers.uploadUrl = function(url, useYTDL, target, callback) {
    if (!url) {
        callback(url);
        return;
    }

    var resultUrl = util.format('https://%s.s3.amazonaws.com/%s', process.env.LAUNDRY_S3_BUCKET, target);
    var params = {
        Bucket: process.env.LAUNDRY_S3_BUCKET,
        Key: target
    };

    // See if the file has previously been uploaded
    log.debug('Looking for ' + params.Key);
    s3.headObject(params, function(err, data) {
        if (data) {
            // It's already there
            log.debug('Found ' + params.Key);
            callback(resultUrl);
            return;
        }

        if (useYTDL) {
            // Use the youtube-dl to change the url into a media url
            log.debug('Getting media URL for ' + url);
            ytdl.getInfo(url, function(err, info) {
                if (err) {
                    callback(err);
                } else {
                    url = info.url;
                    doUpload();
                }
            });
        } else {
            doUpload();
        }
    });

    function doUpload() {
        // Do the upload
        log.debug('Uploading ' + params.Key);
        var protocol = require('url').parse(url).protocol;
        var req = protocol === 'http' ? http.request : https.request;
        req(url, function(response) {
            if (response.statusCode !== 200 && response.statusCode !== 302) {
                callback(url);
                return;
            }

            params.Body = response;
            params.ContentLength = parseInt(response.headers['content-length']);
            params.ContentType = response.headers['content-type'];
            s3.upload(params)
                .on('httpUploadProgress', function(progress) {
                    // console.log(progress);
                }).send(function(err, data) {
                    log.debug('Done uploading ' + params.Key);
                    callback(err ? url : resultUrl);
                });
        }).end();
    }
};

// Delete S3 objects with a last-modified before a given date.
Helpers.deleteBefore = function(prefix, date, callback) {
    log.debug('Cleaning ' + prefix);

    // Get all of the objects with a given prefix.
    var objects = [];
    var lastCount = 0;
    var pageSize = 100;
    async.doWhilst(
        function(callback) {
            s3.listObjects({
                Bucket: process.env.LAUNDRY_S3_BUCKET,
                Prefix: prefix,
                MaxKeys: pageSize,
                Marker: objects.length ? objects[objects.length - 1].Key : ''
            }, function(err, data) {
                if (err) {
                    callback(err);
                } else {
                    objects = objects.concat(data.Contents);
                    lastCount = data.Contents.length;
                    callback(err);
                }
            });
        },
        function() {
            return lastCount === pageSize;
        }, function(err) {
            if (err) {
                callback(err);
                return;
            }

            // Get the objects that are older than the requested date and format them as params.
            objects = objects.filter(function(obj) {
                return moment(obj.LastModified).isBefore(date);
            }).map(function(obj) {
                return {
                    Key: obj.Key
                };
            });

            if (!objects.length) {
                callback(err);
                return;
            }

            // Delete the old objects.
            log.debug(util.format('Cleaning %d objects from %s', objects.length, prefix));
            s3.deleteObjects({
                Bucket: process.env.LAUNDRY_S3_BUCKET,
                Delete: {
                    Objects: objects
                }
            }, function(err, data) {
                callback(err);
            });
        }
    );
};

// Test for empty strings.
validator.extend('isWhitespace', function(str) {
    return /^\s*$/.test(str);
});

// Utility methods
_.oldMerge = _.merge;
_.merge = function(object, sources, customizer, thisArg) {
    return _.oldMerge(object, sources, function(a, b) {
        if (_.isArray(a)) {
            return a.concat(b);
        }
    }, thisArg);
};

module.exports = Helpers;
