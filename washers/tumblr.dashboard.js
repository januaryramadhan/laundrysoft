'use strict';

/*
Tumblr Dashboard washer
input: converts media from the user's Tumblr Dashboard into items
output: none
*/
ns('Washers.Tumblr', global);
Washers.Tumblr.Dashboard = function(config) {
    Washers.Tumblr.call(this, config);

    this.name = 'Tumblr/Dashboard';
    this.className = path.basename(__filename.replace('.js', ''));

    this.input = _.merge(this.input, {
        description: 'Loads recent posts from your Tumblr Dashboard.'
    });
};

Washers.Tumblr.Dashboard.prototype = Object.create(Washers.Tumblr.prototype);

Washers.Tumblr.Dashboard.prototype.doInput = function(callback) {
    this.beforeInput();
    var quantity = 40;
    var posts = [];
    var lastResponse = null;
    var limit = 100;
    var that = this;
    async.doWhilst(function(callback) {

        var opts = {
            limit: Math.min(limit, quantity - posts.length),
            since_id: posts.length ? posts[posts.length - 1].id : null
        };

        // This implements a filter even if null.
        //opts.type = null; // text, quote, link, answer, video, audio, photo, chat

        // https://www.tumblr.com/docs/en/api/v2
        that.client.dashboard(opts, function(err, data) {
            if (err) {
                callback(err);
                return;
            }

            data.posts.forEach(function(post) {
                posts.push(Items.Tumblr.Post.factory(post));
            });

            log.debug(util.format('Got %d/%d posts', posts.length, quantity));
            lastResponse = data;
            callback();
        });
    }, function() {
        return lastResponse.posts.length === limit && posts.length < quantity;
    }, function(err) {
        callback(err, posts);
    });
};

module.exports = Washers.Tumblr.Dashboard;