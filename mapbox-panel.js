/**
 * JARVIS Mapbox Panel — Cinematic 3D city flyover map
 *
 * Alternative to CesiumJS for city-level photorealistic flyovers.
 * Uses Mapbox GL JS with 3D terrain, buildings, pitch/bearing for cinematic camera.
 * Supports sequential waypoint fly-through for storytelling.
 *
 * Events:
 *   mapbox_show: { location, coords:[lat,lon], zoom, pitch, bearing, locations:[] }
 *   mapbox_flythrough: { waypoints: [{name, coords:[lat,lon], zoom, pitch, bearing, duration}] }
 *   mapbox_hide
 *
 * Mapbox free tier: 50K map loads/month — no billing needed for dev.
 * Token from meta tag: <meta name="mapbox-token" content="...">
 */

class MapboxPanel {
    constructor() {
        this.container = document.createElement('div');
        this.container.id = 'mapbox-panel';
        this.container.className = 'viz-panel';
        Object.assign(this.container.style, {
            position: 'fixed',
            right: '20px',
            top: '80px',
            width: '400px',
            height: '300px',
            background: 'rgba(0,0,0,0.88)',
            border: '2px solid rgba(0,180,160,0.55)',
            borderRadius: '10px',
            zIndex: '160',
            opacity: '0',
            transition: 'opacity 0.6s ease',
            display: 'none',
            overflow: 'hidden',
            boxShadow: '0 0 30px rgba(0,180,160,0.1)',
            pointerEvents: 'none',
        });
        document.body.appendChild(this.container);

        this.map = null;
        this._loaded = false;
        this._loading = false;
        this.isVisible = false;
        this._pendingShow = null;
        this._flyingThrough = false;
    }

    async _ensureMapbox() {
        if (this._loaded || this._loading) return;
        this._loading = true;

        // Load Mapbox GL CSS
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.9.0/mapbox-gl.css';
        document.head.appendChild(link);

        // Load Mapbox GL JS
        await new Promise(function(resolve, reject) {
            var script = document.createElement('script');
            script.src = 'https://api.mapbox.com/mapbox-gl-js/v3.9.0/mapbox-gl.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });

        // Get token from meta tag
        var tokenMeta = document.querySelector('meta[name="mapbox-token"]');
        var token = (tokenMeta && tokenMeta.content) || '';
        if (!token) {
            console.warn('[MapboxPanel] No Mapbox token found — using demo token');
            token = 'pk.demo'; // Will fail gracefully
        }

        mapboxgl.accessToken = token;

        // Create map container div inside panel
        var mapDiv = document.createElement('div');
        mapDiv.style.width = '100%';
        mapDiv.style.height = '100%';
        this.container.appendChild(mapDiv);

        this.map = new mapboxgl.Map({
            container: mapDiv,
            style: 'mapbox://styles/mapbox/dark-v11',
            center: [23.7275, 37.9838], // Athens default
            zoom: 4,
            pitch: 45,
            bearing: 0,
            antialias: true,
        });

        var self = this;
        this.map.on('load', function() {
            // Add 3D terrain
            self.map.addSource('mapbox-dem', {
                type: 'raster-dem',
                url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
                tileSize: 512,
                maxzoom: 14,
            });
            self.map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });

            // Add 3D buildings
            var layers = self.map.getStyle().layers;
            var labelLayerId;
            for (var i = 0; i < layers.length; i++) {
                if (layers[i].type === 'symbol' && layers[i].layout['text-field']) {
                    labelLayerId = layers[i].id;
                    break;
                }
            }
            self.map.addLayer({
                id: '3d-buildings',
                source: 'composite',
                'source-layer': 'building',
                filter: ['==', 'extrude', 'true'],
                type: 'fill-extrusion',
                minzoom: 12,
                paint: {
                    'fill-extrusion-color': '#1a1a2e',
                    'fill-extrusion-height': ['get', 'height'],
                    'fill-extrusion-base': ['get', 'min_height'],
                    'fill-extrusion-opacity': 0.7,
                },
            }, labelLayerId);

            // Add sky/atmosphere
            self.map.addLayer({
                id: 'sky',
                type: 'sky',
                paint: {
                    'sky-type': 'atmosphere',
                    'sky-atmosphere-sun': [0.0, 0.0],
                    'sky-atmosphere-sun-intensity': 5,
                },
            });

            self._loaded = true;
            self._loading = false;
            console.log('[MapboxPanel] Mapbox GL JS loaded with 3D terrain + buildings');

            if (self._pendingShow) {
                var ps = self._pendingShow;
                self._pendingShow = null;
                self.show(ps);
            }
        });
    }

    show(data) {
        if (!this._loaded && !this._loading) {
            this._pendingShow = data;
            this._ensureMapbox();
            return;
        }
        if (this._loading) {
            this._pendingShow = data;
            return;
        }

        this.container.style.display = 'block';
        this.container.style.pointerEvents = 'auto';
        this.isVisible = true;
        var el = this.container;
        requestAnimationFrame(function() { el.style.opacity = '1'; });

        // Resize map to fit container
        this.map.resize();

        var coords = data.coords || [37.98, 23.73];
        var zoom = data.zoom || 14;
        var pitch = data.pitch || 60;
        var bearing = data.bearing || 30;

        this.map.flyTo({
            center: [coords[1], coords[0]], // Mapbox uses [lng, lat]
            zoom: zoom,
            pitch: pitch,
            bearing: bearing,
            duration: 4000,
            essential: true,
        });
    }

    async flyThrough(waypoints) {
        if (!this._loaded) {
            this._pendingShow = { flythrough: waypoints };
            this._ensureMapbox();
            return;
        }

        this.container.style.display = 'block';
        this.container.style.pointerEvents = 'auto';
        this.isVisible = true;
        var el = this.container;
        requestAnimationFrame(function() { el.style.opacity = '1'; });
        this.map.resize();

        this._flyingThrough = true;

        for (var i = 0; i < waypoints.length; i++) {
            if (!this._flyingThrough) break;
            var wp = waypoints[i];
            var coords = wp.coords || [0, 0];
            await new Promise(function(resolve) {
                this.map.flyTo({
                    center: [coords[1], coords[0]],
                    zoom: wp.zoom || 14,
                    pitch: wp.pitch || 60,
                    bearing: wp.bearing || (30 + i * 45),
                    duration: wp.duration || 4000,
                    essential: true,
                });
                this.map.once('moveend', resolve);
            }.bind(this));
            // Pause between waypoints
            await new Promise(function(r) { setTimeout(r, 1000); });
        }

        this._flyingThrough = false;
    }

    hide() {
        this._flyingThrough = false;
        this.container.style.opacity = '0';
        this.container.style.pointerEvents = 'none';
        this.isVisible = false;
        var el = this.container;
        setTimeout(function() { el.style.display = 'none'; }, 600);
    }

    handleMessage(msg) {
        if (msg.type === 'mapbox_show') this.show(msg);
        else if (msg.type === 'mapbox_flythrough') this.flyThrough(msg.waypoints || []);
        else if (msg.type === 'mapbox_hide') this.hide();
    }

    get container() { return this._container || this.container; }
}

window.mapboxPanel = new MapboxPanel();
console.log('[MapboxPanel] Initialized — cinematic 3D city flyover ready');
