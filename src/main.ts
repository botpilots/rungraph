import './style.css'
import p5 from 'p5'
import { GoalGraphRenderer } from './GoalGraphRenderer'
import { generateSampleData } from './utils'

// Clear out any existing content and add a container for the graph and info box
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div id="info-box"></div>
  <div id="graph-container"></div>
  <div class="view-toggle-container">
    <span>3 Weeks</span>
    <label class="switch">
      <input type="checkbox" id="view-toggle-checkbox" checked>
      <span class="slider round"></span>
    </label>
    <span>Full</span>
  </div>
`

// Generate the sample data based on the image
const { start, goal, activities } = generateSampleData()

let renderer: GoalGraphRenderer

// Create the p5 sketch
const sketch = (p: p5) => {

	p.setup = () => {
		// Renderer will handle canvas creation and setup
		p.textFont('Arial') // Set a default font globally if needed

		// Instantiate the renderer class, passing the p5 instance, data, and parent container ID
		renderer = new GoalGraphRenderer(p, start, goal, activities, 'graph-container', 'sunday')

		// Explicitly call windowResized once after instantiation to ensure correct initial size
		// This helps avoid timing issues where the container size might not be ready during the constructor.
		if (renderer) {
			renderer.windowResized();
		} else {
			console.error("Renderer assignment failed in setup!");
		}
	}

	p.draw = () => {
		// Call the renderer's draw method in each frame
		if (renderer) {
			try {
				renderer.draw()
			} catch (e) {
				console.error("Error calling renderer.draw():", e);
				console.error("Renderer object was:", renderer); // Log the object again on error
				p.noLoop(); // Stop the draw loop to prevent flooding console
			}
		} else {
			console.warn("Renderer not ready in draw loop");
		}
	}

	// Forward windowResized event to the renderer
	p.windowResized = () => {
		if (renderer) {
			renderer.windowResized()
		}
	}

	// Mouse events are handled internally by the renderer via setupMouseInteraction
}

// Initialize p5.js
new p5(sketch)
