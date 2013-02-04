/**
 * jQuery Photo Book v0.6
 * http://lumens.se
 *
 * Copyright 2013, Reimund Trost
 * http://lumens.se
 */

var NEXT = 1;
var PREVIOUS = -1;

(function($)
{
	$.fn.photobook = function(options)
	{
		var settings, self, is_turning;

		settings = $.extend({
			'page_flip_duration': 1500,
			'wrap_around':        false,
			'page_buttons':       true,
			'themed':             true,
			'container_selector': 'div.main-container',
		}, options);

		self = this;

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

		// By giving each page a unique identifier, we can prevent the complete
		// function of page animations to run in the wrong order. That can
		// happen when a page is rotating very quickly and will cause the
		// incorrect page to be displayed for a short period of time.
		self.page_counter = -1;
		self.last_complete = -1;


		this.init = function()
		{
			self.images = self.find('img');
			
			// If we only have one picture not much needs to be done.
			if(self.images.length <= 1)
				return;
				
			self.current_image = 0;
			self.current_image_left = 0;
			self.current_image_right = 0;
			
			// Get image dimensions.
			self.height = self.images.first().height();
			self.width = self.images.first().width();
			
			// Make sure the element remains this size.
			$(self).width(self.width).height(self.height);
			
			self.left_page = $('<div class="left-page"><div class="seam"/></div>');
			self.left_page.prependTo(self);
			$('<div class="seam" />').prependTo(self);
			self.images.remove();
			self.css('background-image', 'url('+ $(self.images.get(self.current_image)).attr('src') + ')');

			if (settings.page_buttons)
				self.setup_page_buttons();

			if (settings.themed) {
				var html = '\
					<div class="book-board-outer"> \
						<div class="book-board-spine">\
							<div class="board-inside"> \
								<div class="spine"></div> \
							</div> \
							<div class="book-container"> \
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
				$(settings.container_selector).append(html);
				self.insertAfter('div.sheets .sheets-left');
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
		
		this.prepare_for_turn = function(direction)
		{
			var turning_page, next_image, rot_y;

			if (NEXT == direction) {
				// Don't allow flipping in both directions simultaneously.
				if (self.is_turning_backwards)
					return;
				
				self.is_turning_forwards = true;
				target_y = 0; // Start rotation.
				left_image = self.current_image_left;
				right_image = (self.current_image + 1).mod(self.images.length);
				turning_page_front_image = self.current_image;
				turning_page_back_image = right_image;
			} else {
				// Don't allow flipping in both directions simultaneously.
				if (self.is_turning_forwards)
					return;

				self.is_turning_backwards = true;
				target_y = -180;
				left_image = (self.current_image - 1).mod(self.images.length);
				right_image = self.current_image_right;
				turning_page_front_image = left_image;
				turning_page_back_image = self.current_image;
			}

			self.page_counter++;

			var turning_page = new TurningPage(self, self.page_counter);

			self.pages.push(turning_page);
			self.left_page.after(turning_page.el);
			self.drag_speed = 1;

			// Set backgrounds on left & right pages.
			self.left_page.set_bg(self.get_image(left_image));
			self.set_bg(self.get_image(right_image));

			// Turning page, NEXT => front, PREVIOUS => back.
			turning_page.front.set_bg(self.get_image(turning_page_front_image));
			
			// Turning page, NEXT => back, PREVIOUS => front.
			turning_page.back.set_bg(self.get_image(turning_page_back_image));

			turning_page.reordered = false;
			turning_page.direction = direction;
			turning_page.image_index = self.current_image;
			turning_page.rotate_y(target_y);

			if (NEXT == direction) {
				self.current_image = (self.current_image + 1).mod(self.images.length);
			} else {
				self.current_image = (self.current_image - 1).mod(self.images.length);
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
				duration: settings.page_flip_duration,
				complete: function() {
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
						prev_page = self.pages[i - 1];
						prev_page.skip_count += 1;
						prev_page.back.css('background-image', page.back.css('background-image'));
						prev_page.front.css('background-image', page.front.css('background-image'));

						// Forget about this page.
						page.el.remove();
						self.remove_page(page.id);

						return;
					}

					page.el.remove();

					if (NEXT == page.direction) {
						 self.current_image_left = (self.current_image_left + page.skip_count).mod(self.images.length);
						 self.current_image_right = (self.current_image_right + page.skip_count).mod(self.images.length);
						 right_image = self.current_image;
						 left_image = self.current_image_left;
					} else {
						 self.current_image_left = (self.current_image_left - page.skip_count).mod(self.images.length);
						 self.current_image_right = (self.current_image_right - page.skip_count).mod(self.images.length);
						 right_image = page.image_index - page.skip_count;
						 left_image = self.current_image;
					}


					if (self.find('.page').length < 1)
						if (NEXT == page.direction)
							self.is_turning_forwards = false;
						else
							self.is_turning_backwards = false;

					self.left_page.set_bg(self.get_image(left_image));
					self.set_bg(self.get_image(right_image));
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
			return $(self.images.get(index)).attr('src');
		}

		this.init();

		return this;
	};

	/* Add a shortcut for setting background image. */
	$.fn.set_bg = function(src) { this.css('background-image', 'url(' + src + ')'); };

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
