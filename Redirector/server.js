var fs = require('fs'),
	express = require('express'),
	bodyParser = require('body-parser'),
	morgan = require('morgan'),
	conf = require('../common/config'),	
	logger = require('../common/logger'),
	routes = require('./routes');
	
var app = express();
app.use(morgan('combined'));
app.use(bodyParser.json());
app.use('/', routes);

app.use(function(err, req, res, next) {
	res.status(500);
	logger.error(err.stack);
});

// Loads configuration and starts server
conf.load().then(function(configuration){
	var server = app.listen(configuration.get('server:port') || 8081, function() {
		var host = server.address().address;
		var port = server.address().port;
		logger.info('Server is up and running at http://%s:%s', host, port);
	});	
});