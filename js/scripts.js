$( document ).ready(function() {
	// some playing
	$("#logo").click(function(e){
		//e.preventDefault();
	});

	// generalized filter display function
	$(".filterLink").click(function(e){
		e.preventDefault();
		var name = $(this).attr("rel"); // the specific attribute
		$(".filter").not("#"+name).hide(); // hide all others
		$("#"+name).fadeToggle(300);
	});

	// search query
	$("#search").submit(function(e){
		e.preventDefault();
		//console.log($("#searchbar").val());
		// only search if something is in there ;)
		if(query = $("#searchbar").val())
			MM.getQueryData(query);
		$(".filter").hide();

		// autohide keyboard on mobile devices
		// http://stackoverflow.com/questions/8335834/how-can-i-hide-the-android-keyboard-using-javascript
		var field = document.createElement('input');
		field.setAttribute('type', 'text');
		document.body.appendChild(field);

		setTimeout(function() {
		    field.focus();
		    setTimeout(function() {
		        field.setAttribute('style', 'display:none;');
		    }, 50);
		}, 50);

		// fix for martin
		$("html, body").animate({ scrollTop: 0 });
	});

	$("#dealerInfo").click(function(e){MM.showDealerDescription();});
	$("#selectAll").click(function(e){
		e.preventDefault();
		$("#products input").prop('checked', true);
		MM.updateFilterCriteria();
	});

	$("#selectNone").click(function(e){
		e.preventDefault();
		$("#products input").prop('checked', false);
		MM.updateFilterCriteria();
	});
	
	MM.onWindowResize();
});


// The Mate Monkey API Connection
// Implementation for MeteMonkey light v0.1
var MM = {
	map: null,
	markers : L.markerClusterGroup({ showCoverageOnHover: false, spiderfyOnMaxZoom: false }),
	baseURL: 'https://playground.matemonkey.com/api/v1/',
	productFilter: '42,41,7,11,10,9,8,19,20,22,23,21,18,28,30,29,44,43,13,12,27,14,37,36,33,35,34,17,31,26,24,6,5,4,3,1,2,15,16,39,38,32,40,25',
	dealerTypeFilter: '',
	currentBounding: {},
	// the added dealer markers
	addedDealers: [],
	// inits the page and vars
	init: function() {
		/************* MATEMONKEY STUFF ***************/
		// get all products
		//var products = [];
		var prodcutsDOM = $("#products");
		jQuery.ajax( {
			url: MM.baseURL + 'products/', type: 'GET', dataType: 'json',
			success: function(data) {
				//console.log("Data Fetched! - "+ JSON.stringify(data));
				MM.productFilter = "";
				jQuery.each(data.products, function(i, product) {
					//products.push({name:product.name, id:product.id})
					if(product.name != "Club Mate 0.5l")
						prodcutsDOM.prepend("<label><input type='checkbox' name='products[]' value='"
							+ product.id+"' onchange='MM.updateFilterCriteria()' checked />"
							+ product.name+"</label>");
					else
						prodcutsDOM.prepend("<label><input type='checkbox' name='products[]' value='"
							+ product.id+"' onchange='MM.updateFilterCriteria()' checked /><strong>"
							+ product.name+"</strong></label>");

					MM.productFilter += product.id + ',';
				});
				MM.productFilter = MM.productFilter.substring(0, MM.productFilter.length - 1);
		}});


		/************* LEAFLET STUFF ***************/
		// get window height for map size:
		height = window.innerHeight - $("header").height() - $("footer").height()-40;
		$("#map").height(height);
		// console.log("inner: "+ $(window).height() + "| header: "+ $("header").height()+ "| footer: "
		//	+ $("footer").height()+"| new: "+ height);

		// set up the map
		MM.map = new L.Map('map' , { maxZoom: 17 });

		// create the tile layer with correct attribution
		var osmUrl = 'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
		var osmAttrib = 'Map data © <a href="http://openstreetmap.org">OpenStreetMap</a> contributors';
		var osm = new L.TileLayer(osmUrl, {minZoom: 5, maxZoom: 17, attribution: osmAttrib});
		MM.map.addLayer(osm);
		MM.map.addLayer(MM.markers);

		var standardCity = "München";
		var urlCity = location.search.substr(1);

		// check if a dealer is loaded via the url
		if(urlCity != ""){
			var data = urlCity.split("&");
			MM.updateMapWithGeolocation({lat:data[1], lon:data[2]});
			MM.map.setZoom(17);

			// wait till markers are loaded
			// todo: do this as a callback
			setTimeout(function () {
				MM.markers.eachLayer(function(marker) {
					if (marker.title == data[0].substr(3))
						marker.openPopup();
				});
			}, 500);
		}
		//get the current users geolocation
		else if (navigator.geolocation) {
			// only way working on localhost / maybe try something in the callback serverside
			var pos = navigator.geolocation.getCurrentPosition(function (pos) { return pos;});

			if(pos == undefined)
				MM.getQueryData(standardCity);
			else
				MM.updateMapWithGeolocation({lat:pos.coords.latitude, lon:pos.coords.longitude});

	    } else {
	    	MM.getQueryData(standardCity);
	    }

		/* use the ip to get the current position
		jQuery.ajax( { 
		  url: 'http://freegeoip.net/json/', type: 'POST', dataType: 'jsonp',
		  success: function(location) {
		    // Available from freegeoip.net:
		    // city, region_code, region_name, areacode, ip, zipcode, longitude
		    // latitude, country_name, country_code
		    map.setView(new L.LatLng(location.latitude, location.longitude),10);
		    console.log("Location fetched!");
		    
		  }}); */
		
		// refetch dealer data on map events
		MM.map.on("zoomend", function(e) { MM.calculateAddedBoundingBoxes(); });
		MM.map.on("resize", function(e) { MM.calculateAddedBoundingBoxes(); });
		MM.map.on("dragend", function(e) { MM.calculateAddedBoundingBoxes(); });
		MM.map.on("zoomend", function(e) { MM.calculateAddedBoundingBoxes(); });
		
		// hide filterpanels on map events
		MM.map.on("zoomstart", function(e) { $(".filter").fadeOut(100); });
		MM.map.on("click", function(e) { $(".filter").fadeOut(100); });
		
		// display dealer data on marker click and hide it on close
		MM.map.on("popupopen", function (e) {
			$(".filter").fadeOut(100);
			MM.showDealer(e.popup._source.dealerData.id);
		});
		MM.map.on("popupclose", function (e) { 
			$("#dealerInfoWrapper").fadeOut(100, function(){ $("#dealerDescription").hide();});
			$("#dealerDescription").html("");
			$("#dealerInfo").addClass("clickable");
		});

		//console.log(location.search.substr(1));
	},
	// what to do on window resize?
	onWindowResize : function () {
		height = window.innerHeight - $("header").height() - $("footer").height()-40;
		$("#map").height(height);
		$(".filter").css("top",$("header").height()+15);
	},
	// geo encodes a place string and sets view center new
	updateMapWithGeolocation : function (geoLocation) {
		MM.map.setView(new L.LatLng(geoLocation.lat, geoLocation.lon), 9);
		MM.calculateAddedBoundingBoxes();
	},
	// fetch data on bounding box update
	calculateAddedBoundingBoxes : function () {
		// get the current boundaries and fetch the data for it
		// todo: do that one intelligent ;)
	    var bounds = MM.map.getBounds();
	    if(MM.currentBounding != bounds) {
	    	MM.currentBounding = bounds;
			MM.getBoxData( bounds ); //trigger manually
	    }
	},
	// gets the dealerinformation for a given bounding box
	getBoxData: function (bounds) {
		if(bounds == undefined)
			bounds = MM.currentBounding;
		box = bounds._southWest.lat + "," + bounds._southWest.lng + "," + bounds._northEast.lat 
				 + "," + bounds._northEast.lng;
		
		url = MM.baseURL + 'dealers?bbox=' + box;
		//if (MM.productFilter != '')
		url = url + "&product=" + MM.productFilter;
		if (MM.dealerTypeFilter != '')
			url = url + "&type=" + MM.dealerTypeFilter;

		jQuery.ajax( {
			url: url,
			type: 'GET',
			dataType: 'json',
			success: function(data) {
				console.log("Data Fetched! - "+ url);
				MM.dealerToMap(data.dealers);
		}});
	},
	// gets the dealerinformation for a given bounding box
	getQueryData: function (query) {
		jQuery.ajax( {
			url: MM.baseURL + 'search?query=' + query,
			type: 'GET',
			dataType: 'json',
			success: function(data) {
				MM.updateMapWithGeolocation(data);
		}});
	},
	// sets all markers on map for given json data
	dealerToMap : function(data) {
		jQuery.each(data, function(i, val) {
			// check if dealer was already added
			if(MM.addedDealers[val.id] == undefined) {
			//old: if($.inArray(val.id, MM.addedDealers) == -1) {
				var dealer = L.marker([val.address.lat, val.address.lon]).addTo(MM.markers);
				dealer.bindPopup("<strong>"+val.name+"</strong><br>"
					+ val.address.street+" "+val.address.number+"<br>"+val.address.postal+" "
					+ val.address.city+"<br><a href='#' class='more' onclick='event.preventDefault();"
					+ "MM.showDealerDescription();'>&raquo; Produkte anzeigen</a>");
					//"<br><a href='?id=444' onclick='event.preventDefault();MM.showDealer("+val.id+
					//	")'>Mehr anzeigen</a>");
				// note: check how much space this requires
				// + only one network query || - requires disk space?
				dealer.title = val.id;
				MM.addedDealers[val.id] = val;
				dealer.dealerData = val;
			}
		});

		// update all new links
		jQuery(".dealerInfo").click(function(e){
			e.preventDefault();
		})
	},
	// reloads new data if map is moved
	reloadData: function (box) {
		// todo: only load new data
		var data = {};

		// insert new data
		MM.dealerToMap(data);

		// todo: delete if there are too much markers?
	},
	//displays a single dealer with detailed information
	showDealer: function (id) {
		// direct feedback before ajax request
		$(".more").show();
		$("#dealerInfoWrapper").fadeIn(100);
		//display dealerinfo
		$("#dealerInfo h2 span").html(MM.addedDealers[id].name + " <span class='small'> | " 
			+ MM.addedDealers[id].type + "</span>");

		// fetch dealer information
		jQuery.ajax( {
			url: MM.baseURL + 'dealers/' + id + '/stock?current=true',
			type: 'GET',
			dataType: 'json',
			success: function(data) {
				if(MM.addedDealers[id].note != null && MM.addedDealers[id].note != "")
					$("#dealerDescription").append("<p class='note'>Note: "+MM.addedDealers[id].note+"</p>");
					
					// add contact data | is there a nicer way?
					var contact = "<p class='contact'><strong>Contact:</strong><br>";
					// check for both: null and ""
					var web = MM.addedDealers[id].address.web;
					if(web != null && web != "") {
						// small http fix
						if (web.indexOf("http") == -1)
							web = "http://" + web;

						contact += "<a href='"+web+"' target='_blank'>Web</a> | ";
					}
					
					if(MM.addedDealers[id].address.email != null && MM.addedDealers[id].address.email != "") 
						contact += "<a href='mailto:"+MM.addedDealers[id].address.email+"'>Mail</a> | ";
					if(MM.addedDealers[id].address.phone != null && MM.addedDealers[id].address.phone != "") 
						contact += "Phone: " + MM.addedDealers[id].address.phone + " | ";
					contact = contact.substr(0, contact.length-3) + "</p>";
					// only append, if not empty
					if(contact.length > 53) $("#dealerDescription").append(contact);
				//console.log("Data Fetched! - "+ JSON.stringify(data));
				if(data.count != 0) {
					jQuery.each(data.entries, function(i, entry) {
						var output = "<strong>"+entry.product.name+"</strong><br>";
						//if(entry.status != 'unknown')
							output += "<span class='stock-"+entry.status+" stock'> Stock: " 
										+ entry.status + "</span>";
						if(entry.price != '?') {
							p = entry.price + "";
							output += " for ";
							if(p < 100)
								output+= "0";
							else
								output+= p.substring(0,p.length-2);
							output += ","+p.substring(p.length-2)+" "+ MM.addedDealers[id].currency;
							output += " per " + entry.quantity;
						}

						// add date
						var ts = new Date(entry.created_at);
						output += "<span class='timestamp'> (from "
							+ ts.getUTCDate() + "."
							+ ts.getUTCMonth() + "."
							+ ts.getUTCFullYear()
							+")</span>";

						$("#dealerDescription").append(output + "<br>");
					});
					//console.log(MM.addedDealers[id]);
					try {
						window.history.pushState({"pageTitle":MM.addedDealers[id].name},"",
							"index.html?id="+MM.addedDealers[id].id+"&"+MM.addedDealers[id].address.lat+"&"+MM.addedDealers[id].address.lon);
					}
					catch (err) {
						console.log("Doesn't work on local machines:" + err);
					}
				}
				else {
					$("#dealerDescription").append("No entries available for this dealer!");
				}
			}});
	},
	// shows the description
	showDealerDescription: function () {
		$("#dealerInfo").removeClass("clickable");
		$("#dealerDescription").fadeIn(100);

		// hide more button 
		$(".more").fadeOut(100);
	},
	// helper function: updates filter criteria for products
	updateFilterCriteria: function () {
		MM.productFilter = '';
		$("input[name='products[]']:checked").each(function(){
			MM.productFilter += $(this).val() + ',';
		});
		MM.productFilter = MM.productFilter.substring(0, MM.productFilter.length - 1);

		// remove all previous marker
		MM.map.removeLayer(MM.markers);
		MM.markers = L.markerClusterGroup({ showCoverageOnHover: false, spiderfyOnMaxZoom: false });
		MM.map.addLayer(MM.markers);
		MM.addedDealers = [];

		// update with new information
		MM.getBoxData();
	},
	// helper function: updates filter criteria for dealers
	updateDealerFilterCriteria: function () {
		MM.dealerTypeFilter = '';
		$("input[name='dealers[]']:checked").each(function(){
			MM.dealerTypeFilter += $(this).val() + ',';
		});
		MM.dealerTypeFilter = MM.dealerTypeFilter.substring(0, MM.dealerTypeFilter.length - 1);

		// remove all previous marker
		MM.map.removeLayer(MM.markers);
		MM.markers = L.markerClusterGroup({ showCoverageOnHover: false, spiderfyOnMaxZoom: false });
		MM.map.addLayer(MM.markers);
		MM.addedDealers = [];

		// update with new information
		MM.getBoxData();
	}
}

MM.init();
window.onresize = function() { MM.onWindowResize(); };