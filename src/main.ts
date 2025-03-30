import './style.css'
import typescriptLogo from './typescript.svg'
import viteLogo from '/vite.svg'
import { setupCounter } from './counter.ts'
import p5 from 'p5'
import { GoalGraphRenderer } from './GoalGraphRenderer'
import { generateSampleData } from './utils'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <a href="https://vite.dev" target="_blank">
      <img src="${viteLogo}" class="logo" alt="Vite logo" />
    </a>
    <a href="https://www.typescriptlang.org/" target="_blank">
      <img src="${typescriptLogo}" class="logo vanilla" alt="TypeScript logo" />
    </a>
    <h1>Vite + TypeScript</h1>
    <div class="card">
      <button id="counter" type="button"></button>
    </div>
    <p class="read-the-docs">
      Click on the Vite and TypeScript logos to learn more
    </p>
  </div>
`

setupCounter(document.querySelector<HTMLButtonElement>('#counter')!)

// Generate the sample data based on the image
const { start, goal, activities } = generateSampleData()

let renderer: GoalGraphRenderer

// Create the p5 sketch
const sketch = (p: p5) => {

	p.setup = () => {
		// Create canvas based on initial window size or defaults
		const canvasWidth = Math.min(p.windowWidth * 0.9, 800)
		const canvasHeight = 500
		p.createCanvas(canvasWidth, canvasHeight)
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
