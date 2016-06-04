============================
GopherJS_ Input Suggest Menu
============================

Development Environment:

  - `Ubuntu 16.04`_
    (``Chromium 50.0.2661.102 Ubuntu 16.04 (64-bit)``)
  - `Go 1.6.2`_


Install
+++++++

Install GopherJS_ and this package:

.. code-block:: bash

  $ go get -u github.com/gopherjs/gopherjs
  $ go get -u github.com/siongui/gopherjs-input-suggest


Example
+++++++

See Demo_ first. The following is key point in the code.

HTML_:

.. code-block:: html

  <input id="word" type="text" autofocus="autofocus" tabindex="1">

Go_:

.. code-block:: go

  BindSuggest("word", func(w string) []string {
  	// suggestion function implemented by you
  	return frozenTrie.GetSuggestedWords(w, 30)
  })

see `example <example>`_ for complete example.


UNLICENSE
+++++++++

Released in public domain. See UNLICENSE_.


References
++++++++++

.. [1] `GopherJS - A compiler from Go to JavaScript <http://www.gopherjs.org/>`_
       (`GitHub <https://github.com/gopherjs/gopherjs>`__,
       `GopherJS Playground <http://www.gopherjs.org/playground/>`_,
       |godoc|)

.. [2] `Element.classList - Web APIs | MDN <https://developer.mozilla.org/en/docs/Web/API/Element/classList>`_

.. [3] `javascript set left position <https://www.google.com/search?q=javascript+set+left+position>`_

       `HTML DOM Style left Property - W3Schools <http://www.w3schools.com/jsref/prop_style_left.asp>`_

.. [4] `javascript min width <https://www.google.com/search?q=javascript+min+width>`_

       `HTML DOM Style minWidth Property - W3Schools <http://www.w3schools.com/jsref/prop_style_minwidth.asp>`_


.. _Ubuntu 16.04: http://releases.ubuntu.com/16.04/
.. _Go 1.6.2: https://golang.org/dl/
.. _HTML: https://www.google.com/search?q=HTML
.. _Go: https://golang.org/
.. _GopherJS: https://github.com/gopherjs/gopherjs
.. _Demo: https://siongui.github.io/gopherjs-input-suggest/
.. _UNLICENSE: http://unlicense.org/

.. |godoc| image:: https://godoc.org/github.com/gopherjs/gopherjs/js?status.png
   :target: https://godoc.org/github.com/gopherjs/gopherjs/js
