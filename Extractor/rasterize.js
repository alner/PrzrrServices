var fs = require('fs');
var cookie = require('simple-cookie');
var page = require('webpage').create(),
    system = require('system'),
    address, output, size, ext;
    
function parseCookie(str) {
    var c = cookie.parse(str);
	return {
		name: c.name,
		value: c.value,
		domain: c.domain,
		path: c.path,
		httponly: c.httpOnly,
		secure: c.secure,
		expires: (new Date()).getTime() + (1000 * 60 * 60)
	};
}

try {
    var styles = fs.read('styles.css');
} catch(e){};

console.log(system.args);

if (system.args.length < 3) {
    console.log('Usage: rasterize.js URL filename [paperwidth*paperheight|paperformat] [zoom]');
    console.log('  paper (pdf output) examples: "5in*7.5in", "10cm*20cm", "A4", "Letter"');
    console.log('  image (png/jpg output) examples: "1920px" entire page, window width 1920px');
    console.log('                                   "800px*600px" window, clipped to 800x600');
    phantom.exit(1);
} else {
    address = system.args[1];
    output = system.args[2];
    page.viewportSize = { width: 600, height: 600 };
	ext = system.args[2].substr(-4);
    if (system.args.length > 3 && ext === ".pdf") {
        size = system.args[3].split('*');
        page.paperSize = size.length === 2 ? { width: size[0], height: size[1], margin: '0px' }
                                           : { format: system.args[3], orientation: 'portrait', margin: '1cm' };
    } else if (system.args.length > 3 && system.args[3].substr(-2) === "px") {
        size = system.args[3].split('*');
        if (size.length === 2) {
            pageWidth = parseInt(size[0], 10);
            pageHeight = parseInt(size[1], 10);
            page.viewportSize = { width: pageWidth, height: pageHeight };
            page.clipRect = { top: 0, left: 0, width: pageWidth, height: pageHeight };
        } else {
            console.log("size:", system.args[3]);
            pageWidth = parseInt(system.args[3], 10);
            pageHeight = parseInt(pageWidth * 3/4, 10); // it's as good an assumption as any
            console.log("pageHeight:",pageHeight);
            page.viewportSize = { width: pageWidth, height: pageHeight };
        }
    }
    if (system.args.length > 4) {
        page.zoomFactor = system.args[4];
    }
    
    if (system.args.length > 5) {
        console.log(system.args[5]);
        var pcookie = parseCookie(system.args[5]);
        phantom.addCookie(pcookie, address);
    }    

    page.onAlert = function(msg) {
        console.log(msg);
        if(msg.indexOf('onRendered') !== -1) {
			page.evaluate(function(styles){
                  var s = document.createElement("STYLE"),
                  head = document.head || document.getElementsByTagName('head')[0];
                  
                  s.type = "text/css";
                  if (s.styleSheet){
                    s.styleSheet.cssText = styles;
                  } else {
                    s.appendChild(document.createTextNode(styles));
                  }
                  head.appendChild(s);
                                
				  var e = document.querySelector('#content');
				  if(e) {
					e.style.paddingTop = "0px";
				  }
			}, styles);		
		
			if(ext === ".png" || ext === ".gif") {		
				page.evaluate(function(){
					  document.body.style.backgroundColor = "rgba(255,255,255,0)";
					  var e = document.querySelector('#content');
					  if(e) {
						e.style.backgroundColor = "rgba(255,255,255,0)";
					  }
				});
			}
				
            page.render(output, {quality: '80'});
            phantom.exit();
        }
    };

    page.open(address, {encoding: "utf8"}, function (status) {
        console.log('Page loaded: ');
        console.log(address);
        console.log(page.url);
        console.log(status);
        if (status !== 'success') {
            console.error('Unable to load the address!');
            phantom.exit(1);
        } else {
            setTimeout(function(){
                page.onAlert('onRendered');
                phantom.exit(1);
            }, 30000); 
                /*
                    var test = page.evaluate(function(){
                        return window.test;
                    });

                    if(test) {
                        console.log(test);
                        page.evaluate(function(){
                            window.test.onRendered = function(vis){
                                window.isRendered = true;
                            };
                        });
                    }
     
                    var tid = window.setInterval(function () {
                        var isRendered = page.evaluate(function(){
                            return window.isRendered;
                        });
                        if(isRendered) {
                            page.render(output);
                            phantom.exit();                            
                        }
                    }, 100);                    
                */

            /*
            var tid = window.setInterval(function () {
                    var obj = page.evaluate(function(){
                        return window.visualization;
                    });
                    if(obj && obj.state === 1) {
                        window.clearInterval(tid);
                        window.setTimeout(function(){
                            page.render(output);
                            phantom.exit();
                        }, 1000);
                    }
            }, 1000);
            */
        }
    });
}
