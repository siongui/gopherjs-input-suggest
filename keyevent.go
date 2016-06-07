package suggest

const (
	TAB    = 9
	RETURN = 13
	ESC    = 27
	UP     = 38
	DOWN   = 40
)

func keyEventHandler(keycode int, state *SuggestMenuStateMachine) {
	if keycode == RETURN {
		state.HideSuggestMenu()
		return
	}

	if keycode == UP {
		state.HandleArrowUp()
		return
	}

	if keycode == DOWN {
		state.HandleArrowDown()
		return
	}

	w := state.GetWord()
	if w == "" {
		state.HideSuggestMenu()
	} else {
		state.UpdateSuggestMenu(w)
	}
}
