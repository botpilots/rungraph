import './style.css'
import p5 from 'p5'
import { GoalGraphRenderer } from './GoalGraphRenderer'
import { generateSampleData } from './utils'

// Clear out any existing content and add a container for the graph and info box
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div id="info-box"></div>
  <div id="graph-container"></div>
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
	}

	p.draw = () => {
		// Call the renderer's draw method in each frame
		if (renderer) {
			renderer.draw()
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
