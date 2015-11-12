$( document ).ready(function() {
	// some playing
	$("#logo").click(function(e){
		e.preventDefault();
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


var map;
var markers = L.markerClusterGroup({ showCoverageOnHover: false, spiderfyOnMaxZoom: false });

// The Mate Monkey API Connection
// Implementation for MeteMonkey light v0.1
var MM = {
	baseURL: 'http://playground.matemonkey.com/api/v1/',
	productFilter: '',
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
				jQuery.each(data.products, function(i, product) {
					//products.push({name:product.name, id:product.id})
					if(product.name != "Club Mate 0.5l")
						prodcutsDOM.prepend("<label><input type='checkbox' name='products[]' value='"+
							product.id+"' onchange='MM.updateFilterCriteria()' checked />"+product.name+"</label>");
					else
						prodcutsDOM.prepend("<label><input type='checkbox' name='products[]' value='"+
							product.id+"' onchange='MM.updateFilterCriteria()' checked /><strong>"+product.name+"</strong></label>");

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
		map = new L.Map('map' , { maxZoom: 17 });

		// create the tile layer with correct attribution
		var osmUrl = 'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
		var osmAttrib = 'Map data © <a href="http://openstreetmap.org">OpenStreetMap</a> contributors';
		var osm = new L.TileLayer(osmUrl, {minZoom: 5, maxZoom: 17, attribution: osmAttrib});
		map.addLayer(osm);
		map.addLayer(markers);

		var standardCity = "München";

		//get the current users geolocation
		if (navigator.geolocation) {
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
		    // city, region_code, region_name, areacode, ip, zipcode, longitude, latitude, country_name, country_code
		    map.setView(new L.LatLng(location.latitude, location.longitude),10);
		    console.log("Location fetched!");
		    
		  }}); */
		
		// event binding
		map.on("zoomend", function(e) { MM.calculateAddedBoundingBoxes(); });
		map.on("resize", function(e) { MM.calculateAddedBoundingBoxes(); });
		map.on("dragend", function(e) { MM.calculateAddedBoundingBoxes(); });
		map.on("zoomend", function(e) { MM.calculateAddedBoundingBoxes(); });
		map.on("zoomstart", function(e) { $(".filter").hide(100); });
		// if user clicks on map, hide filterpanels
		map.on("click", function(e) { $(".filter").hide(100); });
		// display dealer data on marker click
		map.on("popupopen", function (e){ MM.showDealer(e.popup._source.dealerData.id); });
		map.on("popupclose", function (e){ 
			$("#dealerInfoWrapper").fadeOut(100, function(){ $("#dealerDescription").hide();});
			$("#dealerDescription").html("");
			$("#dealerInfo").addClass("clickable");
		});
	},
	// what to do on window resize?
	onWindowResize : function () {
		height = window.innerHeight - $("header").height() - $("footer").height()-40;
		$("#map").height(height);
		//console.log("resize");
		$(".filter").css("top",$("header").height()+13);
	},
	// geoencodes a place string and sets view center new
	updateMapWithGeolocation : function (geoLocation) {
		map.setView(new L.LatLng(geoLocation.lat, geoLocation.lon), 9);
		MM.calculateAddedBoundingBoxes();
	},
	// fetch data on bounding box update
	calculateAddedBoundingBoxes : function () {
		// get the current boundaries and fetch the data for it
		// todo: do that one intelligent ;)
	    var bounds = map.getBounds();
	    if(MM.currentBounding != bounds) {
	    	MM.currentBounding = bounds;
			MM.getBoxData( bounds ); //trigger manually
	    }
	},
	// sets all markers on map for given json data
	dealerToMap : function(data) {
		jQuery.each(data, function(i, val) {
			// check if dealer was already added
			if(MM.addedDealers[val.id] == undefined) {
			//old: if($.inArray(val.id, MM.addedDealers) == -1) {
				var dealer = L.marker([val.address.lat, val.address.lon]).addTo(markers);
				dealer.bindPopup("<strong>"+val.name+"</strong><br>"+
					val.address.street+" "+val.address.number+"<br>"+val.address.postal+" "+val.address.city+
					"<br><a href='?id=444' onclick='event.preventDefault();MM.showDealerDescription();'>&raquo; Produkte anzeigen</a>");
					//"<br><a href='?id=444' onclick='event.preventDefault();MM.showDealer("+val.id+")'>Mehr anzeigen</a>");
				// note: check how much space this requires
				// + only one network query || - requires disk space? 
				MM.addedDealers[val.id] = val;
				dealer.dealerData = val;
			}
		});

		

		// update all new links
		jQuery(".dealerInfo").click(function(e){
			e.preventDefault();
		})
	},
	// gets the dealerinformation for a given bounding box
	getBoxData: function (bounds) {
		if(bounds == undefined)
			bounds = MM.currentBounding;
		box = bounds._southWest.lat + "," + bounds._southWest.lng + "," + bounds._northEast.lat + "," + bounds._northEast.lng;
		
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
		$("#dealerInfoWrapper").fadeIn(100);
		//display dealerinfo
		$("#dealerInfo h2").html(MM.addedDealers[id].name + " <span> | " + MM.addedDealers[id].type + "</span>");

		// fetch dealer information
		jQuery.ajax( {
			url: MM.baseURL + 'dealers/' + id + '/stock?current=true',
			type: 'GET',
			dataType: 'json',
			success: function(data) {
				if(MM.addedDealers[id].note != '')
					$("#dealerDescription").append("<p class='note'>Note: "+MM.addedDealers[id].note+"</p>");
				//console.log("Data Fetched! - "+ JSON.stringify(data));
				if(data.count != 0) {
					jQuery.each(data.entries, function(i, entry) {
						var output = "<strong>"+entry.product.name+"</strong><br>";
						//if(entry.status != 'unknown')
							output += "<span class='stock-"+entry.status+" stock'> Stock: " + entry.status + "</span>";
						if(entry.price != '?') {
							p = entry.price + "";
							output += " for ";
							if(p < 100)
								output+= "0";
							else
								output+= p.substring(0,p.length-2);
							output += ","+p.substring(p.length-2)+" "+MM.addedDealers[id].currency;
							output += " per " + entry.quantity;
						}

						$("#dealerDescription").append(output + "<br>");
					});
					//console.log(MM.addedDealers[id]);
				}
				else {
					console.log("No entries available for this dealer!");
				}
			}});
	},
	// shows the description
	showDealerDescription: function () {
		$("#dealerInfo").removeClass("clickable");
		$("#dealerDescription").fadeIn(100);
	},
	// helper function: updates filter criteria for products
	updateFilterCriteria: function () {
		MM.productFilter = '';
		$("input[name='products[]']:checked").each(function(){
			MM.productFilter += $(this).val() + ',';
		});
		MM.productFilter = MM.productFilter.substring(0, MM.productFilter.length - 1);

		// remove all previous marker
		map.removeLayer(markers);
		markers = L.markerClusterGroup({ showCoverageOnHover: false, spiderfyOnMaxZoom: false });
		map.addLayer(markers);
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
		map.removeLayer(markers);
		markers = L.markerClusterGroup({ showCoverageOnHover: false, spiderfyOnMaxZoom: false });
		map.addLayer(markers);
		MM.addedDealers = [];

		// update with new information
		MM.getBoxData();
	}
}

MM.init();

// auto hide status bar on mobile
window.onresize = function() { MM.onWindowResize(); };