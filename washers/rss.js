var Backbone = require('Backbone'); // http://backbonejs.org/
var _ = require('lodash'); // https://lodash.com/docs

var Washer = require('../washer');

RSS = Washer.extend({
    defaults: {
        name: 'RSS'
    },

    input: {
        description: 'Loads data from an RSS feed.',
        settings: [{
            name: 'url',
            type: 'url',
            prompt: 'What RSS feed URL do you want to launder?'
        }]
    },

    output: {
        description: 'Writes data to an RSS feed on disk.',
        settings: [{
            name: 'file',
            type: 'file',
            prompt: 'Where do you want to save the output?'
        }]
    },

    doAuthorize: null,

    doInput: function() {
        console.log('input');
    },

    doOutput: function() {
        console.log('output');
    }
});

_.merge(Washer.prototype.defaults, RSS.prototype.defaults);
module.exports = RSS;