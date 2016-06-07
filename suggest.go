package suggest

import (
	"github.com/gopherjs/gopherjs/js"
	gojs "github.com/siongui/gopherjs-utils"
)

func createStyle() *js.Object {
	css := `
	.suggest {
	  border-top-color: #C9D7F1;
	  border-right-color: #36C;
	  border-bottom-color: #36C;
	  border-left-color: #A2BAE7;
	  border-style: solid;
	  border-width: 1px;
	  z-index: 10;
	  padding: 0;
	  background-color: white;
	  overflow: hidden;
	  position: absolute;
	  text-align: left;
	  font-size: large;
	  border-radius: 4px;
	  margin-top: 1px;
	  line-height: 1.25em;
	}
	.wordSelected {
	  background: #00C;
	  color: white;
	  cursor: pointer;
	}
	.invisible {
	  display: none;
	}`

	s := js.Global.Get("document").Call("createElement", "style")
	s.Set("innerHTML", css)
	return s
}

func createSuggestMenu() *js.Object {
	sm := js.Global.Get("document").Call("createElement", "div")
	sm.Get("classList").Call("add", "suggest")
	sm.Get("classList").Call("add", "invisible")
	return sm
}

// initialization function
func BindSuggest(id string, fnSugguestWords func(string) []string) {
	input := js.Global.Get("document").Call("getElementById", id)
	// insert style of suggest-menu at the end of head element
	js.Global.Get("document").Call("getElementsByTagName", "head").Call("item", 0).Call("appendChild", createStyle())
	// insert suggest-menu after input
	sm := createSuggestMenu()
	gojs.InsertAfter(sm, input)

	state := NewSuggestMenuStateMachine(input, sm, fnSugguestWords)

	input.Call("addEventListener", "keyup", func(event *js.Object) {
		keycode := event.Get("keyCode").Int()
		keyEventHandler(keycode, state)
	}, false)
}
