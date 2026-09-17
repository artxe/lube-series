import parser from "@typescript-eslint/parser"
import lube from "eslint-plugin-lube"
/** @type {import("eslint").Linter.Config[]} */
export default [
	{
		ignores: [
			"coverage/**",
			"packages/*/types/**"
		]
	},
	{
		files: [
			"**/*.js",
			"**/*.json",
			"**/*.mjs",
			"**/*.ts"
		],
		languageOptions: {
			ecmaVersion: "latest",
			parser,
			sourceType: "module"
		},
		plugins: lube.configs.plugins,
		rules: { ...lube.configs.rules }
	},
	{
		files: [
			"packages/async-lube/src/**/*.js",
			"test/async-lube/**/*.js"
		],
		rules: { "no-await-in-loop": "off" }
	}
]