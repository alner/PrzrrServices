var express = require('express');
var senseUtils = require('../common/sense-utils');
var config = require('../common/config');
var routes = express.Router();

/**
 * @api {get} /a/:id Redirect to the sense app and make appropriate selection
 * @apiName a
 * @apiParam {String} id unique ID
 * 
 */
routes.get('/a/:id', function(req, res, next) {
	var id = req.params.id;			
	senseUtils.makeRedirectionFor(id)
	.then(function(result){
		res.writeHead(301, result);
		res.end();		
		//var sessionCookies = result['Set-Cookie'];
		//process.nextTick(function(){
		//	senseUtils.makeSelectionFor(id, sessionCookies);
		//});
	})
	.catch(function(err){
		res.status(404).send(err);
	});
});

/**
 * @api {post} /config/reload Reloads configuration file
 *  
 */
routes.post('/config/reload', function(req, res) {
	if(!(req.body 
		&& req.body.config_reload_token
		&& req.body.config_reload_token === config.configuration.get('config_reload_token'))) { 
			res.sendStatus(400);
	}
	else {
		config.load()
		.then(function(configuration){
			res.status(200).json(configuration);
		})
		.catch(function(err){
			res.status(500).end(err);
		});		
	}
});

module.exports = routes;