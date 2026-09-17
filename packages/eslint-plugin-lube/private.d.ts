import * as eslint from "eslint"
import * as estree from "estree"
export type AstNode = BaseAstNode & (
	{
		elements: (AstNode | null)[]
	} & estree.ArrayExpression
	| {
		elements: (AstNode | null)[]
	} & estree.ArrayPattern
	| {
		body: AstNode
		params: AstNode[]
	} & estree.ArrowFunctionExpression
	| {
		left: AstNode
		right: AstNode
	} & estree.AssignmentExpression
	| estree.AssignmentPattern
	| estree.AwaitExpression
	| estree.BinaryExpression
	| estree.BlockStatement
	| estree.BreakStatement
	| {
		arguments: AstNode[]
		callee: AstNode
	} & estree.CallExpression
	| estree.CatchClause
	| estree.ChainExpression
	| estree.ClassBody
	| estree.ClassDeclaration
	| estree.ClassExpression
	| estree.ConditionalExpression
	| estree.ContinueStatement
	| estree.DebuggerStatement
	| estree.DoWhileStatement
	| estree.EmptyStatement
	| estree.ExportAllDeclaration
	| estree.ExportDefaultDeclaration
	| {
		source?: {
			range: [number, number]
			raw: string
			value: string
		} & estree.SimpleLiteral
		specifiers: AstNode[]
	} & estree.ExportNamedDeclaration
	| estree.ExportSpecifier
	| estree.ExpressionStatement
	| estree.ForInStatement
	| estree.ForOfStatement
	| estree.ForStatement
	| {
		body: AstNode
		id?: AstNode
		params: AstNode[]
	} & estree.FunctionDeclaration
	| {
		body: AstNode
		id?: AstNode
		params: AstNode[]
	} & estree.FunctionExpression
	| estree.Identifier
	| estree.IfStatement
	| {
		source: {
			range: [number, number]
			raw: string
			value: string
		} & estree.SimpleLiteral
		specifiers: AstNode[]
	} & estree.ImportDeclaration
	| estree.ImportDefaultSpecifier
	| estree.ImportExpression
	| estree.ImportNamespaceSpecifier
	| estree.ImportSpecifier
	| estree.LabeledStatement
	| estree.Literal
	| estree.LogicalExpression
	| estree.MemberExpression
	| estree.MetaProperty
	| estree.MethodDefinition
	| {
		arguments: AstNode[]
		callee: AstNode
	} & estree.NewExpression
	| {
		properties: AstNode[]
	} & estree.ObjectExpression
	| {
		properties: AstNode[]
	} & estree.ObjectPattern
	| estree.PrivateIdentifier
	| estree.Program
	| {
		key: AstNode & (
			estree.Identifier
			| estree.Literal
		)
		value: AstNode
	} & estree.Property
	| estree.PropertyDefinition
	| estree.RestElement
	| estree.ReturnStatement
	| {
		expressions: AstNode[]
	} & estree.SequenceExpression
	| {
		argument: AstNode
	} & estree.SpreadElement
	| estree.StaticBlock
	| estree.Super
	| estree.SwitchCase
	| estree.SwitchStatement
	| estree.TaggedTemplateExpression
	| estree.TemplateElement
	| estree.TemplateLiteral
	| estree.ThisExpression
	| estree.ThrowStatement
	| estree.TryStatement
	| estree.UnaryExpression
	| estree.UpdateExpression
	| estree.VariableDeclaration
	| {
		id: AstNode
		init: AstNode
	} & estree.VariableDeclarator
	| estree.WhileStatement
	| estree.WithStatement
	| estree.YieldExpression
)
export type BaseAstNode = {
	decorators?: AstNode[]
	parent: AstNode
	range: [number, number]
	returnType?: AstNode
	typeAnnotation?: AstNode
	typeArguments?: AstNode
	typeParameters?: AstNode
}
export type CastingLevel = {
	close: number
	close_end: number
	open: number
	type: string | undefined
}
export type Comment = BaseAstNode & estree.Comment & {
	loc: estree.SourceLocation
}
export type DirectiveSource = {
	getDisableDirectives?: () => {
		directives: DisableDirective[]
	}
}
export type DisableDirective = {
	node: Comment
	type: "disable" | "disable-line" | "disable-next-line" | "enable"
	value: string
}
export type ModuleDeclaration = estree.ExportNamedDeclaration | estree.ImportDeclaration
export type NamingIdentifier = AstNode & estree.Identifier
export type NamingParent = AstNode | {
	computed?: boolean
	id?: AstNode | null
	initializer?: AstNode
	left?: AstNode
	parent?: AstNode
	type: "AccessorProperty" | "Decorator" | "ImportAttribute" | "JSXExpressionContainer" | "JSXSpreadAttribute" | "JSXSpreadChild" | "TSAbstractAccessorProperty" | "TSAbstractMethodDefinition" | "TSAbstractPropertyDefinition" | "TSAsExpression" | "TSCallSignatureDeclaration" | "TSConstructSignatureDeclaration" | "TSConstructorType" | "TSDeclareFunction" | "TSEmptyBodyFunctionExpression" | "TSEnumDeclaration" | "TSEnumMember" | "TSExportAssignment" | "TSFunctionType" | "TSImportEqualsDeclaration" | "TSIndexSignature" | "TSInstantiationExpression" | "TSInterfaceDeclaration" | "TSMappedType" | "TSMethodSignature" | "TSModuleDeclaration" | "TSNamespaceExportDeclaration" | "TSNonNullExpression" | "TSPropertySignature" | "TSQualifiedName" | "TSSatisfiesExpression" | "TSTypeAliasDeclaration" | "TSTypeAssertion" | "TSTypeParameter" | "TSTypePredicate" | "TSTypeQuery"
	value?: AstNode | null
}
export type OrderEntry = {
	first: OrderNode
	last: OrderNode
	name: string
	rank?: number | undefined
	report: OrderNode
}
export type OrderItem = {
	after: number
	break_after: boolean
	break_before: boolean
	closes: boolean
	code_end: number
	entry: OrderEntry
	head: boolean
	header: boolean
	leading: boolean
	level: number
	semicolon: boolean
	sep_end: number
	start: number
	tail_line: boolean
	tail_start: number
	terminated: boolean
}
export type OrderLayout = "member" | "sequence" | "statement"
export type OrderNode = estree.Node | TsNode
export type OrderRuleListener = {
	[K in OrderNode["type"]]?: (node: OrderNode & { type: K }) => void
} & {
	"Program:exit"?: () => void
}
export type RenamePlan = {
	atomic: boolean
	exported: NamingIdentifier[]
	fixable: boolean
	held: NamingIdentifier[]
	used: NamingIdentifier[]
}
export type RenameEdit = {
	range: [number, number]
	text: string
}
export type RuleListener = {
	[K in keyof eslint.Rule.NodeListener]?: (node: AstNode & (K extends AstNode["type"] ? { type: K } : unknown)) => void
} & {
	JSXIdentifier?: (node: AstNode & estree.Identifier) => void
}
export type RuleOptions = {
	"ascii-order"?: {
		checkDeclarations?: boolean
		checkImports?: boolean
		checkKeys?: boolean
		checkNames?: boolean
		checkTests?: boolean
	}
	"pretty-imports"?: {
		checkExports?: boolean
		checkImports?: boolean
		fixIndent?: boolean
		indent?: string
		maxLength?: number
		semicolon?: boolean
	}
	"pretty-jsdoc-casting": never
	"pretty-sequence"?: {
		arrayBracketSpacing?: boolean
		checkArray?: boolean
		checkCall?: boolean
		checkObject?: boolean
		checkSequence?: boolean
		fixIndent?: boolean
		funcCallSpacing?: boolean
		ignoreTemplateLiteral?: boolean
		indent?: string
		maxLength?: number
		objectCurlySpacing?: boolean
	}
	"pretty-ternary"?: {
		ignoreTemplateLiteral?: boolean
		indent?: string
		maxLength?: number
	}
	"svelte-naming-convention"?: {
		fixSameNames?: boolean
	}
}
export type Sequence = {
	end: number
	items: (AstNode | null)[]
	line_indent: string
	spacing: boolean
	start: number
}
export type SequenceItem = {
	after_comma: string
	after_comma_comments: number
	after_comma_line_comment: boolean
	after_comma_newline: boolean
	code_end: number
	code_start: number
	left: number
	node: AstNode
	right: number
	text: string
	trailing_line_comment: boolean
}
export type TernaryGap = {
	depth: number
	end: number
	line_break: boolean
	start: number
}
export type TernaryNode = {
	alternate: TernaryNode
	consequent: TernaryNode
	extendsType: TernaryNode
	falseType: TernaryNode
	parent: TernaryNode | null
	range: [number, number]
	test: TernaryNode
	trueType: TernaryNode
	type: string
}
export type TsNode = estree.BaseNode & (
	{
		body: OrderNode[]
		type: "TSInterfaceBody" | "TSModuleBlock"
	}
	| {
		computed: boolean
		key: OrderNode
		type: "TSMethodSignature" | "TSPropertySignature"
	}
	| {
		expression: OrderNode
		type: "TSAsExpression" | "TSNonNullExpression" | "TSSatisfiesExpression" | "TSTypeAssertion"
	}
	| {
		id: estree.Identifier | null
		type: "TSDeclareFunction"
	}
	| {
		members: OrderNode[]
		type: "TSTypeLiteral"
	}
)