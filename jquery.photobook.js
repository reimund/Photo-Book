/**
 * jQuery Photo Book v0.5
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
			'page_flip_duration' : 1000,
			'wrap_around' : false,
			'page_buttons' : true,
		}, options);

		self = this;
		self.is_turning_forwards = false;
		self.is_turning_backwards = false;
		self.drag_start = null;

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
			
			self.left_page = $('<div/>', { 'class': 'left_page'});
			
			// The element that will act as a flipping page.
			self.page = $('<div/>', { 'class': 'page' });

			self.turning_page_front = $('<div/>', { 'class': 'turning_page_front'}).appendTo(self.page);
			self.turning_page_back = $('<div/>', { 'class': 'turning_page_back'}).appendTo(self.page);
			self.left_page.prependTo(self);
			self.images.remove();
			self.css('background-image', 'url('+ $(self.images.get(self.current_image)).attr('src') + ')');

			if (settings.page_buttons)
				self.setup_page_buttons();
		};

		this.next = function()
		{
			self.turn(NEXT);
			self.turn_animation(self.find('.page').first());
		};

		this.previous = function()
		{
			self.turn(PREVIOUS);
			self.turn_animation(self.find('.page').first());
		};
		
		this.on('swipeleft', function() {
			// Don't swipe if we already are dragging a page since that can
			// trigger a double flip on non-touch devices.
			if (null == self.drag_start)
				self.next();
		});

		this.on('swiperight', function() {

			// Don't swipe if we already are dragging a page since that can
			// trigger a double flip on non-touch devices.
			if (null == self.drag_start)
				self.previous();
		});

		this.turn = function(direction)
		{
			var turning_page, next_image, rot_y;

			if (NEXT == direction) {
				// Don't allow flipping in both directions simultaneously.
				if (self.is_turning_backwards)
					return;
				
				self.is_turning_forwards = true;
				r0 = 0; // Start rotation.
				r1 = -180; // End rotation.
				left_image = self.current_image_left;
				right_image = (self.current_image + 1).mod(self.images.length);
				turning_page_front_image = self.current_image;
				turning_page_back_image = right_image;
			} else {
				// Don't allow flipping in both directions simultaneously.
				if (self.is_turning_forwards)
					return;

				self.is_turning_backwards = true;
				r0 = -180;
				r1 = 0;
				left_image = (self.current_image - 1).mod(self.images.length);
				right_image = self.current_image_right;
				turning_page_front_image = left_image;
				turning_page_back_image = self.current_image;
			}

			turning_page = self.page.clone();
			self.left_page.after(turning_page);

			// Left.
			self.left_page.set_bg(self.get_image(left_image));

			// Right.
			self.set_bg(self.get_image(right_image));

			// Turning page, NEXT => front, PREVIOUS => back.
			turning_page.find('.turning_page_front').set_bg(self.get_image(turning_page_front_image));
			
			// Turning page, NEXT => back, PREVIOUS => front.
			turning_page.find('.turning_page_back').set_bg(self.get_image(turning_page_back_image));

			turning_page.data('reordered', 'no');
			turning_page.data('direction', direction);
			turning_page.data('index', self.current_image);
			turning_page.rotate_y(r0);

			if (NEXT == direction)
				self.current_image = (self.current_image + 1).mod(self.images.length);
			else
				self.current_image = (self.current_image - 1).mod(self.images.length);

			// Turn the page.
			self.on('mousemove', function(e) {
				var current_drag = (e.pageX - this.offsetLeft) - self.width / 2;
				var y = Math.min(0, Math.max(-180, (current_drag - self.drag_start) * (180 / (self.drag_start * 2))));

				if (PREVIOUS == direction)
					y = -180 -y;

				turning_page.rotate_y(y);
			});

		};

		this.turn_animation = function(turning_page)
		{
			var direction, current_y, target_y, duration;

			direction = turning_page.data('direction');
			current_y = self.get_rotation_degrees(turning_page);
			target_y = NEXT == direction ? -180 : 0;

			// Make the duration shorter the further the page has been dragged.
			duration = Math.abs(current_y-target_y) / 180 * settings.page_flip_duration;

			turning_page.css('textIndent', current_y);
			turning_page.animate({textIndent: target_y}, {
				step: function(now, fx) {
					// When the pages have turned more than 90 degrees we must
					// flip the ordering of the pages for it to look right.
					if (((NEXT == direction && -90 > now)
							|| (PREVIOUS == direction && -90 < now)
							) && $(this).data('reordered') == 'no') {

						var parent = $(this).parent();
						$(this).detach();
						parent.append($(this));
						$(this).data('reordered', 'yes');
					}

					$(this).rotate_y(now);
				},
				duration: duration,
				easing: 'easeInOutCubic',
				complete: function() {

					if (NEXT == direction) {
						 self.current_image_left = (self.current_image_left + 1).mod(self.images.length);
						 self.current_image_right = (self.current_image_right + 1).mod(self.images.length);
						 right_image = self.current_image;
						 left_image = self.current_image_left;
					} else {
						 self.current_image_left = (self.current_image_left - 1).mod(self.images.length);
						 self.current_image_right = (self.current_image_right - 1).mod(self.images.length);
						 right_image = $(this).data('index') - 1;
						 left_image = self.current_image;
					}
					
					$(this).remove();

					if (self.find('.page').length < 1)
						if (NEXT == direction)
							self.is_turning_forwards = false;
						else
							self.is_turning_backwards = false;

					self.left_page.set_bg(self.get_image(left_image));
					self.set_bg(self.get_image(right_image));
				}
			});
		};

		this.setup_page_buttons = function()
		{
			$('body').on('mouseup', function(e) {
				if (e.which != 1)
					return;

				var parent_offset, rel_x, page;

				parent_offset = $(this).parent().offset(); 
				rel_x = e.pageX - parent_offset.left;
				page = self.find('.page');

				// Stop dragging.
				self.unbind('mousemove');
				self.drag_start = null;

				if (page.length > 0)
					self.turn_animation(page.first());
			});

			self.on('mousedown', function(e) {
				if (e.which != 1)
					return;

				var parent_offset = $(this).parent().offset(); 
				var rel_x = e.pageX - parent_offset.left;

				self.drag_start = (e.pageX - this.offsetLeft) - self.width / 2;

				if ((rel_x / $(this).width()) > 0.5)
					self.turn(NEXT);
				else
					self.turn(PREVIOUS);
			});
		};

		this.get_rotation_degrees = function(el)
		{
			var matrix = el.css("-webkit-transform")
				|| el.css("-moz-transform")
				|| el.css("-ms-transform")
				|| el.css("-o-transform")
				|| el.css("transform");

			if (matrix !== 'none') {
				var values = matrix.split('(')[1].split(')')[0].split(',');
				var a = values[0];
				var b = values[2];
				var angle = -Math.atan2(b, a) * (180/Math.PI);
			} else {
				var angle = 0;
			}

			return angle;
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



/* Modulus implementation that handles negative numbers nicer than JavaScript's
 * remainder operator (%). */
Number.prototype.mod = function(n)
{
	return ((this % n) + n) % n;
}
