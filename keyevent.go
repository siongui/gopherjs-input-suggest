package suggest

const (
	TAB    = 9
	RETURN = 13
	ESC    = 27
	LEFT   = 37
	UP     = 38
	RIGHT  = 39
	DOWN   = 40
)

func keyEventHandler(keycode int) {
	if keycode == RETURN {
		// Enter key
		state.HideSuggestMenu()
		return
	}

	if keycode == LEFT {
		return
	}

	if keycode == RIGHT {
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

	if keycode == ESC {
		state.HandleESC()
		return
	}

	UpdateSuggestion()
}
