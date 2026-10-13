import parser from "@typescript-eslint/parser"
import lube from "eslint-plugin-lube"
/** @type {import("eslint").Linter.Config[]} */
export default [
	{
		ignores: [
			".claude/settings*.json",
			".tmp/**",
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
		plugins: lube.configs.strict.plugins,
		rules: { ...lube.configs.strict.rules }
	},
	{
		files: [ "**/*.js" ],
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: [ "vitest.config.js" ]
				},
				tsconfigRootDir: import.meta.dirname
			}
		}
	}
]