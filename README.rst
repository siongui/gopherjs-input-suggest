============================
GopherJS_ Input Suggest Menu
============================

Development Environment:

  - `Ubuntu 15.10`_
  - `Go 1.6`_


Install
+++++++

Install GopherJS_:

.. code-block:: bash

  $ go get -u github.com/gopherjs/gopherjs


Example
+++++++

HTML:

.. code-block:: html

  <input id="word" type="text" autofocus="autofocus" tabindex="1">

Go_:

.. code-block:: go

  BindSuggest("word", func(w string) []string {
  	// suggestion function implemented by you
  	return frozenTrie.GetSuggestedWords(w, 30)
  })

see `example <example>`_ for more details.


UNLICENSE
+++++++++

Released in public domain. See UNLICENSE_.


References
++++++++++

.. [1] `Element.classList - Web APIs | MDN <https://developer.mozilla.org/en/docs/Web/API/Element/classList>`_

.. [2] `How to do insert After() in JavaScript without using a library? - Stack Overflow <http://stackoverflow.com/questions/4793604/how-to-do-insert-after-in-javascript-without-using-a-library>`_


.. _Ubuntu 15.10: http://releases.ubuntu.com/15.10/
.. _Go 1.6: https://golang.org/dl/
.. _Go: https://golang.org/
.. _GopherJS: https://github.com/gopherjs/gopherjs
.. _UNLICENSE: http://unlicense.org/
