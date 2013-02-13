/**
 * jQuery Photo Book v0.8
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
			'width':               null, // Width of the book.
			'height':              null, // Height of the book.
			'page_flip_duration':  1500, // Flipping duration in milliseconds. Shorter duration => faster flipping.
			'wrap_around':         false, // When true, flipping the last image will loop back to the first.
			'page_buttons':        true, // Flip pages by clicking/dragging/swiping the left and right side of the book.
			'themed':              true, // Tells whether the elements should be styled as a book or not.
			'start_page_image':    null, // Url to the image that will be displayed on the first page.
			'end_page_image':      null, // Url to the image that will be displayed on the last page.
			'start_page_selector': null, // Overrides first_image.
			'end_page_selector':   null, // Overrides last_image.
			'start_page':          0, // Page number, 0 being 'start_page', n being 'end_page'.
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

		this.init = function()
		{
			self.images = self.find('img');

			// If we only have one picture not much needs to be done.
			if(self.images.length <= 1)
				return;
				
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
			
			// Create the elements that will represent pages.
			self.left_page = $('<div class="left-page"><div class="gutter"/></div>');
			self.right_page = $('<div class="right-page" />');
			self.left_page.prependTo(self);
			self.left_page.after(self.right_page);

			// No need to create start and end pages if wrap_around is enabled.
			if (!self.settings.wrap_around) {
				if (self.settings.start_page_selector) {
					self.start_page = $(self.settings.start_page_selector).first().clone().addClass('right-page start-page');
					self.right_page.after(self.start_page);
					self.start_page.hide();
				}

				if (self.settings.end_page_selector) {
					self.end_page = $(self.settings.end_page_selector).not('.start-page').first().clone().addClass('left-page end-page');
					self.left_page.after(self.end_page);
					self.end_page.hide();
				}
			}

			$('<div class="gutter" />').prependTo(self);
			self.images.remove();


			if (self.settings.page_buttons)
				self.setup_page_buttons();

			if (self.settings.themed) {
				var html = '\
					<div class="book-container"> \
						<div class="spine">\
							<div class="pastedown-container"> \
								<div class="pastedown"></div> \
							</div> \
							<div class="fore-edge-container"> \
								<div class="fore-edge"> \
									<div class="fore-edge-left"> \
										<div class="top"></div> \
										<div class="bottom"></div> \
									</div> \
									<div class="fore-edge-right"> \
										<div class="top"></div> \
										<div class="bottom"></div> \
									</div> \
								</div> \
							</div> \
						</div> \
					</div>';

				self.detach();
				$(self.settings.container_selector).append(html);
				self.insertAfter('div.fore-edge .fore-edge-left');
			}

			// Add 'simple' class if browser doesn't support border-image.
			if (undefined == self.closest('.book-container').css('border-image-slice'))
				self.closest('.book-container').addClass('simple');

			// Set width & heights.
			self.closest('.book-container').width(self.settings.width);
			self.closest('.spine').width(self.settings.width);
			self.closest('.fore-edge-container').width(self.settings.width + self.sheet_width * 2);
			self.closest('.fore-edge-container').css('top', -self.settings.height + 'px');
			self.closest('.spine').height(self.settings.height);
			self.closest('.pastedown-container').height(self.settings.height);
			self.closest('.spine').find('div.pastedown').height(self.settings.height - 4 * 2); // Numbers from border image.
			self.closest('.book-container.simple').find('.spine div.pastedown').height(self.settings.height); // No border on simple version.
			self.parent().find('div.top').height(self.settings.height - self.sheet_height);

			self.set_page(self.settings.start_page - 1);
			self.update_sheets('left');
			self.update_sheets('right');
		};

		this.set_page = function(page_number)
		{
			// Update current image state.
			if (self.settings.wrap_around)
				self.current_image = page_number.mod(self.images.length);
			else
				self.current_image = Math.max(-1, Math.min(page_number, self.images.length));

			self.static_side_image = self.current_image;

			// Set backgrounds for
			// Start page:
			if (-1 == self.current_image)
			{
				self.left_page.set_bg(null, 'transparent');
				self.right_page.set_bg(self.settings.start_page_image, 'purple');

				if (null != self.start_page) {
					// Put the start page in place.
					self.right_page.after(self.start_page.addClass('right-page').detach());
					self.start_page.show();
					self.right_page.hide();
				}

			}
			else if (self.images.length == self.current_image)
			// End page:
			{
				self.left_page.set_bg(self.settings.end_page_image, 'purple');
				self.right_page.set_bg(null, 'transparent');

				if (null != self.end_page) {
					// Put the end page in place.
					self.left_page.after(self.end_page.addClass('left-page').detach());
					self.end_page.show();
					self.left_page.hide();
				}
			}
			else
			// All other pages:
			{
				self.left_page.set_bg(self.get_image(self.current_image));
				self.right_page.set_bg(self.get_image(self.current_image));
				self.left_page.show();
				self.right_page.show();

				if (null != self.start_page) self.start_page.hide();
				if (null != self.end_page) self.end_page.hide();
			}
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
		};

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
			switch (bs.phase) {

				case NEXT_START:
					self.right_page.show();
					self.right_page.set_bg(self.get_image(bs.d));

					// If start_page is used, put it inside the turning page.
					if (null != self.start_page)
						turning_page.front.append(self.start_page.removeClass('right-page').detach());

					turning_page.back.set_bg(self.get_image(bs.b));
					turning_page.front.set_bg(self.settings.start_page_image, 'purple');

					self.update_sheets('right');

					break;

				case NEXT_MIDDLE:
					// If the first turning page is the first page, ensure
					// that the left side still is transparent.
					if (NEXT_START != self.pages[0].phase)
						self.left_page.set_bg(self.get_image(bs.a));

					self.right_page.set_bg(self.get_image(bs.d));
					turning_page.front.set_bg(self.get_image(bs.c));
					turning_page.back.set_bg(self.get_image(bs.b));

					self.update_sheets('right');

					break;

				case NEXT_END:
					self.right_page.set_bg(null, 'transparent');
					turning_page.front.set_bg(self.get_image(bs.c));
					turning_page.back.set_bg(self.settings.end_page_image, 'purple');

					// If end_page is used, put it inside the turning page.
					if (null != self.end_page) {
						turning_page.back.append(self.end_page.removeClass('left-page').show().detach());
						turning_page.back.set_bg(null, 'transparent');
					}

					self.update_sheets('right');

					break;

				case PREVIOUS_START:
					self.left_page.set_bg(null, 'transparent');
					turning_page.front.set_bg(self.settings.start_page_image, 'purple');
					turning_page.back.set_bg(self.get_image(bs.c));

					// If start_page is used, put it inside the turning page.
					if (null != self.start_page) {
						turning_page.front.append(self.start_page.removeClass('right-page').show().detach());
						turning_page.front.set_bg(null, 'transparent');
					}

					self.update_sheets('left');

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

					self.update_sheets('left');

					break;

				case PREVIOUS_END:
					self.left_page.show();
					self.left_page.set_bg(self.get_image(bs.a));

					// If end_page is used, put it inside the turning page.
					if (null != self.end_page)
						turning_page.back.append(self.end_page.removeClass('left-page').detach());

					turning_page.front.set_bg(self.get_image(bs.b));
					turning_page.back.set_bg(self.settings.end_page_image, 'purple');

					self.update_sheets('left');

					break;
			}


			return turning_page;
		};

		this.update_sheets = function(side)
		{
			var n, a, x1, x2;
			
			if (self.settings.wrap_around)
				// It doesn't make sense to change the sheets with wrap_around.
				return;

			// The number of sheets we will represent. The current sprite
			// graphic limits us to a maximum of 8.
			//n = Math.min(self.images.length, 8);
			n = 8;
			a = self.images.length / n; // How many pages we show per sheet.

			// Compute indices for each sprite section, which will be used for
			// positioning the sprite 
			x1 = Math.max(0, Math.min(Math.round((self.images.length - self.current_image - 1) / a), n - 1));
			x2 = x1 + n;

			// When we got fewer than n images, we got a 1:1 match between
			// sheets we can draw and actual pages. Do some number magic to get
			// that working.
			if (n >= self.images.length) {
				x1 = n - (n - self.images.length) - self.current_image - 1;
				x2 = n * 2 - self.current_image - 1;
			}

			if ('left' == side) {
				// Left sheets.
				self.closest('.fore-edge').find('.fore-edge-left div').each(function() {
					$(this).css('background-position-x', (x2 * -10) + 'px');
				});
			}
			else if ('right' == side)
			{
				self.closest('.fore-edge').find('.fore-edge-right div').each(function() {
					$(this).css('background-position-x', (x1 * -10) + 'px');
				});
			}
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
		};

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

				current_drag = (e.pageX - self.offset().left) - self.width / 2;
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
		};

		this.remove_page = function(id)
		{
			for (i in self.pages)
				if (self.pages[i].id == id) {
					self.pages.splice(i, 1);
					break;
				}
		};

		this.turn_complete = function(page) {
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

					// If the skipped page contains a start or end page
					// we must put that in the page we keep.
					if (0 < page.el.find('.start-page').length)
						prev_page.front.append(self.start_page.detach());

					if (0 < page.el.find('.end-page').length)
						prev_page.back.append(self.end_page.detach());

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
					self.update_sheets('left');

					break;

				case NEXT_END:
					self.left_page.set_bg(self.settings.end_page_image, 'purple');

					if (null != self.end_page) {
						// Put the end page in place.
						self.left_page.after(self.end_page.addClass('left-page').detach());
						self.end_page.show();
						self.left_page.hide();
					}

					self.update_sheets('left');

					break;

				case NEXT_MIDDLE:
					self.left_page.set_bg(self.get_image(self.static_side_image));
					self.update_sheets('left');

					break;

				case PREVIOUS_START:

					if (null != self.start_page) {
						// Put the start page in place.
						self.right_page.after(self.start_page.addClass('right-page').detach());
						self.start_page.show();
						self.right_page.hide();
					}

					self.right_page.set_bg(self.settings.start_page_image, 'purple');
					self.left_page.set_bg(null, 'transparent');

					self.update_sheets('right');

					break;

				case PREVIOUS_MIDDLE:
					self.left_page.set_bg(self.get_image(self.current_image));
					self.right_page.set_bg(self.get_image(self.static_side_image));

					// Check if the last turning page is the first
					// page. If so, let the board show through...
					if (PREVIOUS_START == self.pages[self.pages.length - 1].phase)
						self.left_page.set_bg(null, 'transparent');

					self.update_sheets('right');

					break;

				case PREVIOUS_END:
					self.right_page.set_bg(self.get_image(self.static_side_image));

					// Check if the last turning page is the first
					// page. If so, let the board show through...
					if (PREVIOUS_START != self.pages[self.pages.length - 1].phase)
						self.left_page.set_bg(self.get_image(self.current_image));

					self.update_sheets('right');

					break;
			}


			if (self.find('.page').length < 1)
				if (NEXT == page.direction)
					self.is_turning_forwards = false;
				else
					self.is_turning_backwards = false;

			self.pages.shift();

			self.last_complete = page.id + page.skip_count - 1;
		};

		this.turn_animation = function(page)
		{
			page.animate_turn({
				drag_speed: self.drag_speed,
				duration: self.settings.page_flip_duration,
				complete: function() { self.turn_complete(page); }
			});
		};

		this.setup_page_buttons = function()
		{
			// Use fallback for old browsers withour 3d transform support.
			if (!has3d()) {
				self.left_page.add(self.end_page)
					.on('click', function() {
						self.set_page(self.current_image - 1);
					});

				self.right_page.add(self.start_page)
					.on('click', function() {
						self.set_page(self.current_image + 1);
					});

				return;
			}

			self.on('vmousedown', function(e) {
				if (e.which != 1 && e.which != 0)
					return;

				var parent_offset = $(this).parent().offset(); 
				var rel_x = e.pageX - parent_offset.left;

				self.drag_start = (e.pageX - self.offset().left) - self.width / 2;

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
				'background-color': null == color ? '#000' : color,
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
	this.front = $('<div class="front"><div class="gutter" /></div>').appendTo(this.el);
	this.back = $('<div class="back"><div class="gutter" /></div>').appendTo(this.el);
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

/**
 * Used for debugging purposes.
 */
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

/**
 * Detect browser 3d rotation support.
 *
 * By Lorenzo Polidori.
 * https://gist.github.com/lorenzopolidori/3794226
 */
function has3d()
{
	var el = document.createElement('p'), 
		has3d,
		transforms = {
			'webkitTransform':'-webkit-transform',
			'OTransform':'-o-transform',
			'msTransform':'-ms-transform',
			'MozTransform':'-moz-transform',
			'transform':'transform'
		};

	// Add it to the body to get the computed style.
	document.body.insertBefore(el, null);

	for (var t in transforms) {
		if (el.style[t] !== undefined) {
			el.style[t] = "translate3d(1px,1px,1px)";
			has3d = window.getComputedStyle(el).getPropertyValue(transforms[t]);
		}
	}

	document.body.removeChild(el);

	return (has3d !== undefined && has3d.length > 0 && has3d !== "none");
}
