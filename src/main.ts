import './style.css'
import p5 from 'p5'
import { GoalGraphRenderer } from './GoalGraphRenderer'
import { generateSampleData } from './utils'

// Clear out any existing content and add a container for the graph and info box
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div id="graph-container"></div>
  <div id="info-box"></div>
`

// Generate the sample data based on the image
const { start, goal, activities } = generateSampleData()

let renderer: GoalGraphRenderer

// Create the p5 sketch
const sketch = (p: p5) => {

	p.setup = () => {
		// Create canvas based on initial window size or defaults
		const canvasWidth = Math.min(p.windowWidth * 0.9, 800)
		const canvasHeight = 500
		const canvas = p.createCanvas(canvasWidth, canvasHeight)
		canvas.parent('graph-container') // Add canvas to the graph container
		p.textFont('Arial') // Set a default font

		// Instantiate the renderer class, passing the p5 instance and data
		// Trial day is 'sunday' based on image labels "Sun ..." for trial points
		renderer = new GoalGraphRenderer(p, start, goal, activities, 'sunday')
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
