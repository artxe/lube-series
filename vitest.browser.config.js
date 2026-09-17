import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"
export default defineConfig(
	{
		test: {
			browser: {
				enabled: true,
				headless: true,
				instances: [ { browser: "chromium" } ],
				provider: playwright()
			},
			globalSetup: [ "./test/browser/server.js" ],
			include: [ "test/browser/**/*.test.js" ],
			testTimeout: 20000
		}
	}
)