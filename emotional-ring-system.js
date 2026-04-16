/**
 * Emotional Ring System for JARVIS Orb
 * Creates rotating rings around orb that respond to voice input and emotional states
 */

class EmotionalRingSystem {
    constructor(visualizer) {
        this.visualizer = visualizer;
        this.scene = visualizer.scene;
        this.rings = [];
        
        // Ring system configuration
        this.config = {
            maxRings: 5,                    // Maximum number of rings
            baseRingRadius: 3.0,           // Base radius from orb center
            radiusVariation: 0.5,          // ±0.5 variation in radius
            ringThickness: 0.1,            // Ring thickness
            ringSegments: 32,              // Ring geometry segments
            
            // Rotation speeds (emotional mapping)
            calmRotationSpeed: 0.3,        // Calm/neutral state
            focusedRotationSpeed: 0.6,     // Focused/active state  
            excitedRotationSpeed: 1.2,     // Excited/engaged state
            intenseRotationSpeed: 2.0,     // Intense/urgent state
            
            // Scaling factors (voice amplitude mapping)
            minScale: 0.8,                 // Minimum ring scale (low amplitude)
            maxScale: 1.5,                 // Maximum ring scale (high amplitude)
            
            // Color mapping (emotional states)
            calmColor: new THREE.Color(0x00ffff),    // Cyan
            focusedColor: new THREE.Color(0x33ff66), // Green cyan
            excitedColor: new THREE.Color(0xffcc00), // Orange yellow
            intenseColor: new THREE.Color(0xff3366), // Red magenta
            
            // Opacity mapping
            baseOpacity: 0.7,
            amplitudeOpacityMultiplier: 1.5,
            
            // Frequency behavior mapping
            bassRingThickness: 0.15,       // Bass frequencies = thicker rings
            midRingThickness: 0.1,         // Mid frequencies = standard thickness
            highRingThickness: 0.05,       // High frequencies = thinner rings
        };
        
        // Emotional state tracking
        this.currentEmotionalState = 'calm';
        this.emotionalStateHistory = [];
        
        // Voice input tracking
        this.currentAmplitude = 0;
        this.currentFrequencyDistribution = { bass: 0, mid: 0, high: 0 };
        this.speechCadence = 0;
        
        // Initialize rings
        this.initializeRings();
        
        console.log('Emotional Ring System initialized');
    }
    
    /**
     * Initialize rings around orb
     */
    initializeRings() {
        // Create initial rings with varied radii
        for (let i = 0; i < 3; i++) {
            this.createRing(i);
        }
    }
    
    /**
     * Create a single ring with specified index
     */
    createRing(index) {
        const radius = this.config.baseRingRadius + 
                      (index * 0.5) + 
                      (Math.random() * this.config.radiusVariation);
        
        // Create torus geometry for ring
        const geometry = new THREE.TorusGeometry(
            radius,                    // Radius of the ring
            this.config.ringThickness, // Thickness of the ring
            this.config.ringSegments,  // Radial segments
            this.config.ringSegments   // Tubular segments
        );
        
        // Create material with glowing effect
        const material = new THREE.MeshBasicMaterial({
            color: this.config.calmColor,
            transparent: true,
            opacity: this.config.baseOpacity,
            side: THREE.DoubleSide
        });
        
        // Create mesh
        const ring = new THREE.Mesh(geometry, material);
        
        // Position ring around orb center
        ring.position.set(0, 0, 0);
        
        // Add to scene
        this.scene.add(ring);
        
        // Store ring data
        this.rings.push({
            mesh: ring,
            index: index,
            baseRadius: radius,
            currentScale: 1.0,
            rotationSpeed: this.config.calmRotationSpeed,
            rotationDirection: Math.random() < 0.5 ? 1 : -1,
            thickness: this.config.ringThickness,
            targetColor: this.config.calmColor,
            currentColor: this.config.calmColor,
            opacity: this.config.baseOpacity,
            frequencyType: index % 3 === 0 ? 'bass' : index % 3 === 1 ? 'mid' : 'high'
        });
        
        return ring;
    }
    
    /**
     * Update ring system based on emotional state and voice input
     */
    update(emotionalState, amplitude, frequencyDistribution, speechCadence) {
        // Update tracking variables
        this.currentEmotionalState = emotionalState;
        this.currentAmplitude = amplitude;
        this.currentFrequencyDistribution = frequencyDistribution;
        this.speechCadence = speechCadence;
        
        // Update each ring based on current state
        this.rings.forEach((ring, index) => {
            this.updateRing(ring, index);
        });
        
        // Update emotional state history
        this.emotionalStateHistory.push({
            state: emotionalState,
            amplitude: amplitude,
            timestamp: Date.now()
        });
        
        // Keep history limited to 100 entries
        if (this.emotionalStateHistory.length > 100) {
            this.emotionalStateHistory.shift();
        }
    }
    
    /**
     * Update individual ring properties
     */
    updateRing(ring, index) {
        // Determine emotional state parameters
        let rotationSpeed, targetColor;
        
        switch (this.currentEmotionalState) {
            case 'calm':
                rotationSpeed = this.config.calmRotationSpeed;
                targetColor = this.config.calmColor;
                break;
            case 'focused':
                rotationSpeed = this.config.focusedRotationSpeed;
                targetColor = this.config.focusedColor;
                break;
            case 'excited':
                rotationSpeed = this.config.excitedRotationSpeed;
                targetColor = this.config.excitedColor;
                break;
            case 'intense':
                rotationSpeed = this.config.intenseRotationSpeed;
                targetColor = this.config.intenseColor;
                break;
            default:
                rotationSpeed = this.config.calmRotationSpeed;
                targetColor = this.config.calmColor;
        }
        
        // Apply amplitude-based scaling
        const amplitudeScale = this.config.minScale + 
                              (this.currentAmplitude * (this.config.maxScale - this.config.minScale));
        
        // Apply frequency-based thickness
        let thicknessMultiplier = 1.0;
        if (ring.frequencyType === 'bass') {
            thicknessMultiplier = this.currentFrequencyDistribution.bass * 2;
        } else if (ring.frequencyType === 'mid') {
            thicknessMultiplier = this.currentFrequencyDistribution.mid * 1.5;
        } else if (ring.frequencyType === 'high') {
            thicknessMultiplier = this.currentFrequencyDistribution.high;
        }
        
        // Update ring rotation
        ring.rotationSpeed = rotationSpeed * ring.rotationDirection;
        
        // Update ring scale (amplitude responsive)
        ring.currentScale = amplitudeScale;
        
        // Update ring color (emotional state responsive)
        ring.targetColor = targetColor;
        
        // Smooth color transition
        ring.currentColor = this.interpolateColor(
            ring.currentColor,
            ring.targetColor,
            0.1 // Smooth transition rate
        );
        
        // Update ring opacity (amplitude responsive)
        ring.opacity = this.config.baseOpacity * 
                       (1 + this.currentAmplitude * this.config.amplitudeOpacityMultiplier);
        
        // Apply updates to mesh
        ring.mesh.rotation.y += ring.rotationSpeed * 0.01; // Rotate around Y axis
        
        // Scale ring based on amplitude
        ring.mesh.scale.setScalar(ring.currentScale);
        
        // Update color
        ring.mesh.material.color.copy(ring.currentColor);
        
        // Update opacity
        ring.mesh.material.opacity = Math.min(ring.opacity, 1.0);
        
        // Apply thickness effect via opacity
        ring.mesh.material.opacity *= (1 + thicknessMultiplier * 0.5);
    }
    
    /**
     * Interpolate between two THREE.Color objects
     */
    interpolateColor(color1, color2, factor) {
        const r = color1.r + (color2.r - color1.r) * factor;
        const g = color1.g + (color2.g - color1.g) * factor;
        const b = color1.b + (color2.b - color1.b) * factor;
        
        return new THREE.Color(r, g, b);
    }
    
    /**
     * Analyze voice input to determine emotional state
     */
    analyzeVoiceInput(amplitude, frequencyDistribution, speechRate) {
        // Determine emotional state based on voice characteristics
        let emotionalState = 'calm';
        
        // High amplitude + fast speech = excited
        if (amplitude > 0.7 && speechRate > 3) {
            emotionalState = 'excited';
        }
        // High amplitude + bass dominant = intense
        else if (amplitude > 0.8 && frequencyDistribution.bass > 0.6) {
            emotionalState = 'intense';
        }
        // Moderate amplitude + balanced frequencies = focused
        else if (amplitude > 0.4 && frequencyDistribution.mid > 0.4) {
            emotionalState = 'focused';
        }
        // Low amplitude = calm
        else {
            emotionalState = 'calm';
        }
        
        return emotionalState;
    }
    
    /**
     * Get current emotional state summary
     */
    getEmotionalSummary() {
        return {
            state: this.currentEmotionalState,
            amplitude: this.currentAmplitude,
            frequencyDistribution: this.currentFrequencyDistribution,
            speechCadence: this.speechCadence,
            ringCount: this.rings.length,
            ringStates: this.rings.map(ring => ({
                index: ring.index,
                rotationSpeed: ring.rotationSpeed,
                scale: ring.currentScale,
                color: ring.currentColor.getHexString(),
                opacity: ring.opacity,
                frequencyType: ring.frequencyType
            }))
        };
    }
    
    /**
     * Add a new ring (triggered by intense voice input)
     */
    addRing() {
        if (this.rings.length < this.config.maxRings) {
            const newRing = this.createRing(this.rings.length);
            console.log('New ring added:', this.rings.length);
            return newRing;
        }
        return null;
    }
    
    /**
     * Remove a ring (when emotional intensity decreases)
     */
    removeRing() {
        if (this.rings.length > 1) {
            const removedRing = this.rings.pop();
            this.scene.remove(removedRing.mesh);
            console.log('Ring removed:', removedRing.index);
            return removedRing;
        }
        return null;
    }
    
    /**
     * Reset rings to calm state
     */
    resetToCalm() {
        this.currentEmotionalState = 'calm';
        this.currentAmplitude = 0;
        
        this.rings.forEach(ring => {
            ring.rotationSpeed = this.config.calmRotationSpeed * ring.rotationDirection;
            ring.currentScale = 1.0;
            ring.targetColor = this.config.calmColor;
            ring.opacity = this.config.baseOpacity;
        });
    }
}