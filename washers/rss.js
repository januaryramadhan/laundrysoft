var fs = require('fs-extra'); // https://www.npmjs.com/package/fs.extra
var _ = require('lodash'); // https://lodash.com/docs
var request = require('request'); // https://www.npmjs.com/package/request
var moment = require('moment'); // http://momentjs.com/docs/

var FeedParser = require('feedparser'); // https://www.npmjs.com/package/feedparser
var RSS = require('rss'); // https://www.npmjs.com/package/rss

var Washer = require('../washer');
var Item = require('../item');

/*
RSS washer
input: converts an RSS/Atom/RDF file on the internet into Items
output: writes an array of Items to an RSS feed on disk
*/

var rss = function(config) {
    Washer.call(this, config);
    this.name = 'rss';

    this.input = {
        description: 'Loads data from an RSS feed.',
        settings: [{
            name: 'url',
            type: 'url',
            prompt: 'What RSS feed URL do you want to launder?'
        }]
    };

    this.output = {
        description: 'Writes data to an RSS feed on disk.',
        settings: [{
            name: 'file',
            type: 'file',
            prompt: 'Where do you want to save the output?'
        }, {
            name: 'feedname',
            type: 'string',
            prompt: 'What do you want the title of the output feed to be?'
        }]
    }
}

rss.prototype = _.create(Washer.prototype, {
    constructor: rss
});

// Request the feed, parse it into items, and pass it to the output washer.
rss.prototype.doInput = function(callback) {
    var req = request(this.url);
    var feedparser = new FeedParser();
    var items = [];

    req.on('error', function(err) {
        callback(err);
    });

    req.on('response', function(res) {
        var stream = this;
        if (res.statusCode != 200) {
            callback(new Error('Bad status code'));
        }

        stream.pipe(feedparser);
    });

    feedparser.on('error', function(err) {
        callback(err);
    });

    feedparser.on('readable', function() {
        var stream = this;
        var meta = this.meta;
        var item;

        while (item = stream.read()) {
            items.push(new Item({
                title: item.title,
                description: item.description,
                url: item.link,
                date: moment(item.date),
                author: item.author,
                tags: item.categories
            }));
        }
    });

    feedparser.on('end', function(err) {
        callback(err, items);
    });
}

// Format items as an RSS feed and write them to disk.
rss.prototype.doOutput = function(items, callback) {
    var feed = new RSS({
        title: this.feedname,
        description: this.feedname,
        feed_url: 'http://github.com/endquote/laundry',
        site_url: 'http://github.com/endquote/laundry',
        generator: 'Laundry'
    });

    items.forEach(function(item) {
        feed.item({
            title: item.title,
            description: item.description,
            url: item.url,
            date: item.date.toDate(),
            author: item.author,
            categories: item.tags
        });
    });

    var xml = feed.xml({
        indent: true
    });

    fs.writeFile(this.file, xml, function(err) {
        callback(err);
    })
}

module.exports = rss;