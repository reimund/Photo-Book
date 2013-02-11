/**
 * jQuery Photo Book v0.6
 * http://lumens.se
 *
 * Copyright 2013, Reimund Trost
 * http://lumens.se
 */

var NEXT            = 1;
var PREVIOUS        = -1;
var NEXT_START      = 0;
var NEXT_MIDDLE     = 1;
var NEXT_END        = 2;
var PREVIOUS_START  = 3;
var PREVIOUS_MIDDLE = 4;
var PREVIOUS_END    = 5;

(function($)
{
	$.fn.photobook = function(options)
	{
		var self;

		self = this;
		self.settings = $.extend({
			'width':               null,
			'height':              null,
			'page_flip_duration':  1500, // Flipping duration in milliseconds. Shorter duration => faster flipping.
			'wrap_around':         false, // When true, flipping the last image will loop back to the first.
			'page_buttons':        true, // Flip pages by clicking/dragging/swiping the left and right side of the book.
			'themed':              true, // Tells whether the elements should be styled as a book or not.
			'first_page_image':    null, // TODO: Url to the image that will be displayed on the first page.
			'first_page_selector': null, // TODO: Overrides first_image.
			'last_page_image':     null, // TODO: Url to the image that will be displayed on the last page.
			'last_page_selector':  null, // TODO: Overrides last_image.
			'start_page':          null, // TODO: Page number, 0 being the page with board and 'first_image'.
			'container_selector': 'div.main-container',
		}, options);


		self.pages = [];

		// Used to prevent rotation of pages in both directions.
		self.is_turning_forwards = false;
		self.is_turning_backwards = false;

		// Horizontal distance from book center. Used to calculate how far one
		// have to drag to get a full turn.
		self.drag_start = null;

		// Used to calculate drag speed.
		self.last_mouse_x = -1;
		self.drag_speed = 1;

		// By giving each page a unique identifier, we can workaround a problem
		// caused by the complete function of page animations runnning in the
		// wrong order. That can happen when a page is rotating very quickly
		// and will cause the incorrect page to be displayed for a short period
		// of time.
		self.page_counter = -1;
		self.last_complete = -1;

		// Size of the sheets that stick out underneath the current pages.
		self.sheet_width = 10;
		self.sheet_height = 20;
		//self.page_queue = new PageQueue(self);


		this.init = function()

		{
			self.images = self.find('img');
			
			// If we only have one picture not much needs to be done.
			if(self.images.length <= 1)
				return;
				
			self.current_image = 0;
			self.static_side_image = 0;
			
			// Get image dimensions.
			if (self.settings.width == null)
				self.width = self.images.first().width();
			else
				self.width = self.settings.width;

			// Get image dimensions.
			if (self.settings.height == null)
				self.height = self.images.first().height();
			else
				self.height = self.settings.height;
			
			$(self).width(self.width).height(self.height);
			
			self.left_page = $('<div class="left-page"><div class="seam"/></div>');
			self.right_page = $('<div class="right-page" />');
			self.left_page.prependTo(self);
			self.left_page.after(self.right_page);
			$('<div class="seam" />').prependTo(self);
			self.images.remove();
			self.left_page.set_bg(self.get_image(self.current_image));
			self.right_page.set_bg(self.get_image(self.current_image));

			if (self.settings.page_buttons)
				self.setup_page_buttons();

			if (self.settings.themed) {
				var html = '\
					<div class="book-container"> \
						<div class="book-board-spine">\
							<div class="board-inside"> \
								<div class="spine"></div> \
							</div> \
							<div class="sheet-container"> \
								<div class="sheets"> \
									<div class="sheets-left"> \
										<div class="top"></div> \
										<div class="bottom"></div> \
									</div> \
									<div class="sheets-right"> \
										<div class="top"></div> \
										<div class="bottom"></div> \
									</div> \
								</div> \
							</div> \
						</div> \
					</div>';

				self.detach();
				$(self.settings.container_selector).append(html);
				self.insertAfter('div.sheets .sheets-left');
			}

			// Set width & heights.
			self.closest('.book-container').width(self.settings.width);
			self.closest('.book-board-spine').width(self.settings.width);
			self.closest('.sheet-container').width(self.settings.width + self.sheet_width * 2);
			self.closest('.sheet-container').css('top', -self.settings.height + 'px');
			self.closest('.book-board-spine').height(self.settings.height);
			self.closest('.board-inside').height(self.settings.height);
			self.closest('.book-board-spine').find('div.spine').height(self.settings.height - 4 * 2); // Numbers from border image.
			self.parent().find('div.top').height(self.settings.height - self.sheet_height);
		};

		this.next = function()
		{
			var page = self.prepare_for_turn(NEXT)

			if (page)
				self.turn_animation(page);
		};

		this.previous = function()
		{
			var page = self.prepare_for_turn(PREVIOUS);

			if (page)
				self.turn_animation(page);

		};
		
		//     |`                      
		//     |  `                ´|
		//     |    `           ´   |
		//   __|      `      ´      |__
		//  |  |        `.´         |  |
		//  |  |         |          |  |
		//  |  |    b    |     c    |  |
		//  |  |         |          |  |
		//  |   `        |          |  |
		//  |     `      |         ´   |
		//  |  a    `    |      ´      |
		//  |_________`  |   ´    d    |
		//   -----------`.´------------ 
		//  
		//       
		//  Turning forwards:
		//
		//  a: left_page
		//  b: turning_page.back 
		//  c: turning_page.front
		//  d: self
		//
		//  Turning backwards:
		//
		//  a: left_page
		//  b: turning_page.front
		//  c: turning_page.back
		//  d: self
		//
		this.get_state = function(direction)
		{
			var state = {};

			if (NEXT == direction) {

				// The image that will be revealed behind the turning page:
				if (self.settings.wrap_around)
					state.d = (self.current_image + 1).mod(self.images.length);
				else
					state.d = Math.min(self.current_image + 1, self.images.length);


				state.a = self.static_side_image;
				state.b = state.d;
				state.c = self.current_image;

			} else {

				// The image that will be revealed behind the turning page:
				if (self.settings.wrap_around)
					state.a = (self.current_image - 1).mod(self.images.length);
				else
					state.a = Math.max(self.current_image - 1, -1);

				state.b = state.a
				state.c = self.current_image;
				state.d = self.static_side_image;
			}

			if (NEXT == direction
				&& (-1 == self.current_image && !self.settings.wrap_around))
			{
				state.phase = NEXT_START;
			}
			else if (PREVIOUS == direction
					&& (0 == self.current_image && !self.settings.wrap_around))
			{
				state.phase = PREVIOUS_START;
			}
			else if (NEXT == direction
					&& ((self.images.length - 1) == self.current_image && !self.settings.wrap_around))
			{
				state.phase = NEXT_END;
			}
			else if (PREVIOUS == direction
					&& (self.images.length == self.current_image && !self.settings.wrap_around))
			{
				state.phase = PREVIOUS_END;
			}
			else 
			{
				state.phase = (NEXT == direction) ? NEXT_MIDDLE : PREVIOUS_MIDDLE;
			}

			return state;
		}

		this.prepare_for_turn = function(direction)
		{
			var turning_page, rot_y, bs;

			if (NEXT == direction) {
				// Don't allow flipping in both directions simultaneously...
				if (self.is_turning_backwards
						// ...and don't allow flipping past the book board.
						|| self.images.length == self.current_image)
					return;

				self.is_turning_forwards = true;
				target_y = 0; // Start rotation.

			} else {
				// Don't allow flipping in both directions simultaneously...
				if (self.is_turning_forwards 
						// ...and don't allow flipping past the book board.
						|| -1 == self.current_image)
					return;

				self.is_turning_backwards = true;
				target_y = -180; // Start rotation.
			}

			// Create the page that will rotate...
			self.page_counter++;
			turning_page = new TurningPage(self, self.page_counter);

			self.pages.push(turning_page);
			self.right_page.after(turning_page.el);
			self.drag_speed = 1;

			// Get the *browse state*, ie an object that contains indices that
			// will be used to set what image is displayed on what element.
			bs = self.get_state(direction);

			turning_page.phase = bs.phase;
			turning_page.reordered = false;
			turning_page.direction = direction;
			turning_page.image_index = self.current_image;
			turning_page.rotate_y(target_y);

			switch (bs.phase) {

				case NEXT_START:
					self.right_page.set_bg(self.get_image(bs.d));
					turning_page.front.set_bg(null, 'purple');
					turning_page.back.set_bg(self.get_image(bs.b));

					break;

				case NEXT_MIDDLE:
					// If the first turning page is the first page, ensure
					// that the left side still is transparent.
					if (NEXT_START != self.pages[0].phase)
						self.left_page.set_bg(self.get_image(bs.a));

					self.right_page.set_bg(self.get_image(bs.d));
					turning_page.front.set_bg(self.get_image(bs.c));
					turning_page.back.set_bg(self.get_image(bs.b));

					break;

				case NEXT_END:
					self.right_page.set_bg(null, 'transparent');
					turning_page.front.set_bg(self.get_image(bs.c));
					turning_page.back.set_bg(null, 'purple');

					break;

				case PREVIOUS_START:
					self.left_page.set_bg(null, 'transparent');
					turning_page.front.set_bg(null, 'purple');
					turning_page.back.set_bg(self.get_image(bs.c));

					break;

				case PREVIOUS_MIDDLE:
					// If the first turning page is the first page, ensure
					// that the left side still is transparent.
					if (PREVIOUS_START != self.pages[0].phase)
						self.left_page.set_bg(self.get_image(bs.a));

					// If the first turning page is the last page, ensure
					// that the right side still is transparent.
					if (PREVIOUS_END != self.pages[0].phase)
						self.right_page.set_bg(self.get_image(bs.d));

					turning_page.front.set_bg(self.get_image(bs.b));
					turning_page.back.set_bg(self.get_image(bs.c));

					break;

				case PREVIOUS_END:
					self.left_page.set_bg(self.get_image(bs.a));
					turning_page.front.set_bg(self.get_image(bs.b));
					turning_page.back.set_bg(null, 'purple');

					break;
			}

			if (NEXT == direction)
			{
				if (self.settings.wrap_around)
					self.current_image = (self.current_image + 1).mod(self.images.length);
				else
					self.current_image = Math.min(self.current_image + 1, self.images.length);

			}
			else
			{
				if (self.settings.wrap_around)
					self.current_image = (self.current_image - 1).mod(self.images.length);
				else
					self.current_image = Math.max(self.current_image - 1, -1);
			}
			
			return turning_page;
		};

		this.rotation_bounds = function(direction, page)
		{
			var i;

			// Find out what index the specified page currently has in the
			// pages array (stored in variable i).
			for (i in self.pages) {
				if (self.pages[i].y == page.y)
					break;
			}

			if (i > 0)
				if (NEXT == direction)
					return [self.pages[i - 1].y + 0.25, 0];
				else
					return [-180, self.pages[i - 1].y - 0.25]
			else
				return [-180, 0];
		}

		this.drag_turn = function(direction)
		{
			// Will return null if an ongoing turn is already taking place in
			// the opposite direction.
			var turning_page = self.prepare_for_turn(direction)

			if (!turning_page)
				return;

			// Turn the page by moving the mouse.
			self.on('vmousemove', function(e) {
				var current_drag, y, mouse_x, min_max;

				current_drag = (e.pageX - this.offsetLeft) - self.width / 2;
				y = Math.min(0, Math.max(-180, (current_drag - self.drag_start) * (180 / (self.drag_start * 2))));
				mouse_x = e.pageX;

				if (PREVIOUS == direction)
					y = -180 -y;

				// Make sure we don't rotate the current page past pages that
				// are already turning.
				min_max = self.rotation_bounds(direction, turning_page);
				y = Math.max(min_max[0], y);
				y = Math.min(min_max[1], y);

				// Capture mouse speed while dragging.
				if (-1 < self.last_mouse_x)
					self.drag_speed = self.last_mouse_x - mouse_x;

				self.last_mouse_x = mouse_x;

				turning_page.rotate_y(y);
			});
		}

		this.remove_page = function(id)
		{
			for (i in self.pages)
				if (self.pages[i].id == id) {
					self.pages.splice(i, 1);
					break;
				}
		}

		this.turn_animation = function(page)
		{
			page.animate_turn({
				drag_speed: self.drag_speed,
				duration: self.settings.page_flip_duration,
				complete: function() {

					var i;

					// Check if this complete function was called before the
					// complete function of previous the page. This can
					// sometimes happen when a page is dragged very fast.
					if ((self.last_complete + 1) != page.id) {
						var prev_page;

						// Get the previous page index.
						for (i in self.pages)
							if (self.pages[i].id == page.id)
								break;

						// Swap out this page with previous page (ie the one
						// that was supposed to finish before this one).
						if (0 != i) {
							prev_page = self.pages[i - 1];
							prev_page.phase = page.phase;
							prev_page.skip_count += page.skip_count;
							prev_page.back.css('background-color', page.back.css('background-color'));
							prev_page.back.css('background-image', page.back.css('background-image'));
							prev_page.front.css('background-color', page.front.css('background-color'));
							prev_page.front.css('background-image', page.front.css('background-image'));

							// Forget about this page.
							page.el.remove();
							self.remove_page(page.id);

							return;
						}
					}
					
					page.el.remove();

					if (NEXT == page.direction) {

						 if (self.settings.wrap_around) {
							 self.static_side_image = (self.static_side_image + page.skip_count).mod(self.images.length);
						 } else {
							self.static_side_image = Math.min(self.static_side_image + page.skip_count, self.images.length);
						 }

					} else {

						 if (self.settings.wrap_around) {
							 self.static_side_image = (self.static_side_image - page.skip_count).mod(self.images.length);
						 } else {
							self.static_side_image = Math.max(self.static_side_image - page.skip_count, -1);
						 }
					}

					switch (page.phase)
					{
						case NEXT_START:
							self.left_page.set_bg(self.get_image(self.static_side_image));
							break;

						case NEXT_END:
							self.left_page.set_bg(null, 'purple');
							break;

						case NEXT_MIDDLE:
							self.left_page.set_bg(self.get_image(self.static_side_image));
							break;

						case PREVIOUS_START:
							self.right_page.set_bg(null, 'purple');
							self.left_page.set_bg(null, 'transparent');
							break;

						case PREVIOUS_MIDDLE:
							self.left_page.set_bg(self.get_image(self.current_image));
							self.right_page.set_bg(self.get_image(self.static_side_image));

							// Check if the last turning page is the first
							// page. If so, let the board show through...
							if (PREVIOUS_START == self.pages[self.pages.length - 1].phase)
								self.left_page.set_bg(null, 'transparent');
							break;

						case PREVIOUS_END:
							self.right_page.set_bg(self.get_image(self.static_side_image));

							// Check if the last turning page is the first
							// page. If so, let the board show through...
							if (PREVIOUS_START != self.pages[self.pages.length - 1].phase)
								self.left_page.set_bg(self.get_image(self.current_image));
							break;
					}


					if (self.find('.page').length < 1)
						if (NEXT == page.direction)
							self.is_turning_forwards = false;
						else
							self.is_turning_backwards = false;

					self.pages.shift();

					self.last_complete = page.id + page.skip_count - 1;
				}
			});
		};

		this.setup_page_buttons = function()
		{
			self.on('vmousedown', function(e) {
				if (e.which != 1 && e.which != 0)
					return;

				var parent_offset = $(this).parent().offset(); 
				var rel_x = e.pageX - parent_offset.left;

				self.drag_start = (e.pageX - this.offsetLeft) - self.width / 2;

				if ((rel_x / $(this).width()) > 0.5)
					self.drag_turn(NEXT);
				else
					self.drag_turn(PREVIOUS);
				
				e.preventDefault();
			});

			$('body').on('vmouseup', function(e) {
				if (e.which != 1 && e.which != 0)
					return;

				var page, parent_offset, rel_x;

				page = self.pages[self.pages.length - 1];

				if (!page || null == self.drag_start)
					return;

				parent_offset = $(this).parent().offset(); 
				rel_x = e.pageX - parent_offset.left;

				// Stop dragging.
				self.unbind('vmousemove');
				self.drag_start = null;
				self.last_mouse_x = -1;
				self.turn_animation(page);

				e.preventDefault();
			});

		};

		/* Gets the src of the image of the specified index. */
		this.get_image = function(index)
		{
			if (0 > index || null == index)
				return null;

			return $(self.images.get(index)).attr('src');
		}

		this.init();

		return this;
	};

	/* Add a shortcut for setting background image. */
	$.fn.set_bg = function(src, color)
	{
		if (null == src)
			this.css({
				'background-image': 'none',
				'background-color': null == color ? 'red' : color,
			});
		else
			this.css('background-image', 'url(' + src + ')');
	};

	/* Add a shortcut for rotating element. */
	$.fn.rotate_y = function(y)
	{
		this.css('-webkit-transform', 'rotateY(' + y + 'deg)');
		this.css('-moz-transform', 'rotateY(' + y + 'deg)'); 
		this.css('-o-transform', 'rotateY(' + y + 'deg)'); 
		this.css('transform', 'rotateY(' + y + 'deg)');  
	}
}(jQuery));

var TurningPage = function(book, id)
{
	this.id = id;
	this.el = $('<div class="page" />');
	this.front = $('<div class="front"><div class="seam" /></div>').appendTo(this.el);
	this.back = $('<div class="back"><div class="seam" /></div>').appendTo(this.el);
	this.y = 0;
	this.book = book;
	this.skip_count = 1;

	this.reordered = 'no';
	this.direction = null;
	this.image_index = null;

	this.rotate_y = function(y)
	{
		this.el.rotate_y(y);	
		this.y = y;
		this.backface_visibility_fix();

		// XXX: This doesn't really belong here, it's something that should be
		// performed by the book.
		//
		// When the pages have turned more than 90 degrees we must
		// flip the ordering of the pages for it to look right.
		if (((NEXT == this.direction && -90 > y)
				|| (PREVIOUS == this.direction && -90 < y)
				) && !this.reordered) {

			var parent = this.el.parent();
			this.el.detach();
			parent.append(this.el);
			this.reordered = true;
		}
	};

	this.animate_turn = function(options)
	{
		var self, target_y, duration, easing;

		self = this;
		target_y = NEXT == self.direction ? -180 : 0;

		// Don't ease in when released from drag.
		easing = Math.round(self.y) == 0 || Math.round(self.y) == -180
					? 'easeInOutCubic' : 'easeOutCubic';

		// Make the duration shorter the further the page has been dragged.
		duration = Math.abs(self.y - target_y) / 180 * options.duration;

		// Make it even shorter depending on the current drag speed.
		duration = duration / Math.max(1, Math.log(Math.abs(options.drag_speed * 0.5)));

		self.el.css('textIndent', self.y);
		self.el.animate({textIndent: target_y}, {
			step: function(y, fx) {
				var min_max = self.book.rotation_bounds(self.direction, self);

				// Prevent the current page from turning through pages that
				// already are turning.
				y = Math.max(min_max[0], y);
				y = Math.min(min_max[1], y);

				self.rotate_y(y);
			},
			duration: duration,
			easing: easing,
			complete: options.complete,
		});
	}

	/**
	  * Flip visibility. We need to do this since IE doesn't
	  * fully support backface-visiblity.
	  */
	this.backface_visibility_fix = function()
	{
		if (-90 > this.y) {
			if (this.front.css('visibility') == 'visible') {
				this.front.css('visibility', 'hidden');
				this.back.css('visibility', 'visible');
			}
		} else if (-90 <= this.y) {
			if (this.front.css('visibility') == 'hidden') {
				this.front.css('visibility', 'visible');
				this.back.css('visibility', 'hidden');
			}
		}
	};
}

/**
 * Modulus implementation that handles negative numbers nicer than JavaScript's
 * remainder operator (%).
 */
Number.prototype.mod = function(n)
{
	return ((this % n) + n) % n;
}


function phase_to_string(phase)
{
	switch (phase) {

		case NEXT_START:
			return 'NEXT_START';
			break;

		case NEXT_MIDDLE:
			return 'NEXT_MIDDLE';
			break;

		case NEXT_END:
			return 'NEXT_END';
			break;

		case PREVIOUS_START:
			return 'PREVIOUS_START';
			break;

		case PREVIOUS_MIDDLE:
			return 'PREVIOUS_MIDDLE';
			break;

		case PREVIOUS_END:
			return 'PREVIOUS_END';
			break;
	}
}
