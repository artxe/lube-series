const shorthand_for_properties = new Map(
	[
		[ "ac", "align-content" ],
		[ "ai", "align-items" ],
		[ "as", "align-self" ],
		[ "a", "animation" ],
		[ "ar", "aspect-ratio" ],
		[ "bf", "backdrop-filter" ],
		[ "bg", "background" ],
		[ "bgc", "background-color" ],
		[ "bgi", "background-image" ],
		[ "bgp", "background-position" ],
		[ "bgr", "background-repeat" ],
		[ "bgs", "background-size" ],
		[ "bs", "block-size" ],
		[ "bd", "border" ],
		[ "bdb", "border-bottom" ],
		[
			"brbl",
			"border-bottom-left-radius"
		],
		[
			"brbr",
			"border-bottom-right-radius"
		],
		[ "bdc", "border-color" ],
		[ "bdi", "border-inline" ],
		[ "bdl", "border-left" ],
		[ "br", "border-radius" ],
		[ "bdr", "border-right" ],
		[ "bds", "border-style" ],
		[ "bdt", "border-top" ],
		[ "brtl", "border-top-left-radius" ],
		[
			"brtr",
			"border-top-right-radius"
		],
		[ "bdw", "border-width" ],
		[ "b", "bottom" ],
		[ "bsd", "box-shadow" ],
		[ "c", "color" ],
		[ "csm", "color-scheme" ],
		[ "gx", "column-gap" ],
		[ "cq", "container" ],
		[ "cqn", "container-name" ],
		[ "cqt", "container-type" ],
		[ "ct", "content" ],
		[ "cs", "cursor" ],
		[ "d", "display" ],
		[ "ft", "filter" ],
		[ "f", "flex" ],
		[ "fb", "flex-basis" ],
		[ "fg", "flex-grow" ],
		[ "fsk", "flex-shrink" ],
		[ "ff", "font-family" ],
		[ "fs", "font-size" ],
		[ "fst", "font-style" ],
		[ "fw", "font-weight" ],
		[ "g", "gap" ],
		[ "ga", "grid-area" ],
		[ "gaf", "grid-auto-flow" ],
		[ "gc", "grid-column" ],
		[ "gr", "grid-row" ],
		[ "gta", "grid-template-areas" ],
		[ "gtc", "grid-template-columns" ],
		[ "gtr", "grid-template-rows" ],
		[ "h", "height" ],
		[ "is", "inline-size" ],
		[ "in", "inset" ],
		[ "jc", "justify-content" ],
		[ "ji", "justify-items" ],
		[ "js", "justify-self" ],
		[ "l", "left" ],
		[ "ls", "letter-spacing" ],
		[ "lh", "line-height" ],
		[ "m", "margin" ],
		[ "my", "margin-block" ],
		[ "mb", "margin-bottom" ],
		[ "mx", "margin-inline" ],
		[ "ml", "margin-left" ],
		[ "mr", "margin-right" ],
		[ "mt", "margin-top" ],
		[ "mah", "max-height" ],
		[ "maw", "max-width" ],
		[ "mih", "min-height" ],
		[ "miw", "min-width" ],
		[ "of", "object-fit" ],
		[ "op", "opacity" ],
		[ "od", "order" ],
		[ "ol", "outline" ],
		[ "o", "overflow" ],
		[ "ow", "overflow-wrap" ],
		[ "ox", "overflow-x" ],
		[ "oy", "overflow-y" ],
		[ "p", "padding" ],
		[ "py", "padding-block" ],
		[ "pb", "padding-bottom" ],
		[ "px", "padding-inline" ],
		[ "pl", "padding-left" ],
		[ "pr", "padding-right" ],
		[ "pt", "padding-top" ],
		[ "pcc", "place-content" ],
		[ "pci", "place-items" ],
		[ "pcs", "place-self" ],
		[ "pe", "pointer-events" ],
		[ "r", "right" ],
		[ "rt", "rotate" ],
		[ "gy", "row-gap" ],
		[ "sc", "scale" ],
		[ "ta", "text-align" ],
		[ "td", "text-decoration" ],
		[ "to", "text-overflow" ],
		[ "ts", "text-shadow" ],
		[ "tt", "text-transform" ],
		[ "tw", "text-wrap" ],
		[ "t", "top" ],
		[ "tf", "transform" ],
		[ "tr", "transition" ],
		[ "tl", "translate" ],
		[ "us", "user-select" ],
		[ "vs", "visibility" ],
		[ "ws", "white-space" ],
		[ "w", "width" ],
		[ "wb", "word-break" ],
		[ "z", "z-index" ]
	]
)
const shorthand_for_values = new Map(
	[
		[ "block", "display:block" ],
		[ "flex", "display:flex" ],
		[ "grid", "display:grid" ],
		[ "inline", "display:inline" ],
		[
			"inline-block",
			"display:inline-block"
		],
		[ "none", "display:none" ],
		[
			"column",
			"flex-direction:column"
		],
		[
			"column-reverse",
			"flex-direction:column-reverse"
		],
		[ "row", "flex-direction:row" ],
		[
			"row-reverse",
			"flex-direction:row-reverse"
		],
		[ "nowrap", "flex-wrap:nowrap" ],
		[ "wrap", "flex-wrap:wrap" ],
		[
			"wrap-reverse",
			"flex-wrap:wrap-reverse"
		],
		[ "isolate", "isolation:isolate" ],
		[ "absolute", "position:absolute" ],
		[ "fixed", "position:fixed" ],
		[ "relative", "position:relative" ],
		[ "static", "position:static" ],
		[ "sticky", "position:sticky" ]
	]
)
const property_for_shorthand = new Map(
	[ ...shorthand_for_properties ].map(
		([ code, name ]) => [ name, code ]
	)
)
const shorthand_for_declaration = new Map(
	[ ...shorthand_for_values ].map(
		([ word, declaration ]) => [ declaration, word ]
	)
)
export {
	property_for_shorthand,
	shorthand_for_declaration,
	shorthand_for_properties,
	shorthand_for_values
}