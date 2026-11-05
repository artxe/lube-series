import { playwright } from "@vitest/browser-playwright"
import { defaultExclude, defineConfig } from "vitest/config"
export default defineConfig(
	{
		test: {
			projects: [
				{
					extends: true,
					test: {
						exclude: [
							...defaultExclude,
							"test/browser/**"
						],
						name: "node"
					}
				},
				{
					extends: true,
					test: {
						browser: {
							enabled: true,
							headless: true,
							instances: [ { browser: "chromium" } ],
							provider: playwright()
						},
						globalSetup: [ "./test/browser/server.js" ],
						include: [ "test/browser/**/*.test.js" ],
						name: "browser",
						testTimeout: 20000
					}
				}
			]
		}
	}
)