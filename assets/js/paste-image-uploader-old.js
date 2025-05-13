(function ($) {
    console.log('Paste plugin: script loaded');

    // Wait for the media views to be loaded
    $(document).ready(function () {
        if (typeof wp !== 'undefined' && wp.media && wp.media.view) {
            // Store original UploaderInline
            var originalUploaderInline = wp.media.view.UploaderInline;

            // Extend UploaderInline to modify the text
            wp.media.view.UploaderInline = originalUploaderInline.extend({
                render: function () {
                    // Call the original render method
                    originalUploaderInline.prototype.render.apply(this, arguments);

                    console.log('Paste plugin: Customizing uploader text');

                    try {
                        // Remove any dashicons we might have added before
                        this.$el.find('.paste-tooltip-icon').remove();

                        // Remove ALL existing paste shortcut elements from anywhere in the modal
                        this.$el.find('.paste-shortcut').remove();
                        $('.media-modal .paste-shortcut').remove();

                        // Find the "or" text which we'll use as a reference point
                        var $orText = this.$el.find('.upload-ui p, .upload-ui .upload-instructions p').filter(function () {
                            return $(this).text().trim() === 'or';
                        }).first();

                        if ($orText.length) {
                            // Create paste shortcut element with tooltip icon
                            var $shortcutText = $('<p class="paste-shortcut"></p>')
                                .text(PasteImageUploader.strings.paste_shortcut)
                                .append(' <span class="dashicons dashicons-info paste-tooltip-icon" title="' +
                                    PasteImageUploader.strings.paste_powered_by +
                                    '"></span>')
                                .css('margin-bottom', '8px'); // Add space below the paste shortcut

                            // Insert the paste shortcut BEFORE the "or" text
                            $orText.before($shortcutText);

                            // Initialize tooltip if jQuery UI tooltip is available
                            if ($.fn.tooltip) {
                                $('.paste-tooltip-icon').tooltip();
                            }
                        }
                    } catch (e) {
                        console.error('Paste plugin: Error customizing uploader text', e);
                    }

                    return this;
                }
            });

            // Also extend UploaderWindow to catch the other uploader type
            if (wp.media.view.UploaderWindow) {
                var originalUploaderWindow = wp.media.view.UploaderWindow;

                wp.media.view.UploaderWindow = originalUploaderWindow.extend({
                    render: function () {
                        // Call original render
                        originalUploaderWindow.prototype.render.apply(this, arguments);

                        // Remove any paste shortcuts that might have been added here
                        this.$el.find('.paste-shortcut').remove();

                        return this;
                    }
                });
            }

            console.log('Paste plugin: Extended uploader views');
        } else {
            console.log('Paste plugin: wp.media.view not available');
        }
    });

    // Handle paste events on the document
    $(document).on('paste', function (e) {
        console.log('Paste plugin: paste event detected');

        var items = (e.originalEvent.clipboardData || e.clipboardData).items;
        if (!items || items.length === 0) {
            console.log('Paste plugin: no clipboard items found');
            return;
        }

        // Process clipboard items
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (item.type.indexOf('image') !== -1) {
                // Get the image as a file
                var file = item.getAsFile();
                console.log('Paste plugin: image file detected', file);

                // Create a proper filename with timestamp
                var ext = item.type.split('/')[1] || 'png';
                var fileName = 'pasted-image-' + new Date().getTime() + '.' + ext;

                // Create a new File object with proper name (important for WordPress)
                try {
                    file = new File([file], fileName, { type: file.type });
                } catch (e) {
                    // Fallback for browsers that don't support File constructor
                    file.name = fileName;
                }

                // Upload the image (with priority chain)
                uploadPastedImage(file);
            }
        }
    });

    /**
     * Handle uploading a pasted image through various available methods
     */
    function uploadPastedImage(file) {
        // Try the different upload methods in priority order
        var usingWordPress = tryWordPressUploaders(file);

        // Only use AJAX if WordPress uploaders failed
        if (!usingWordPress) {
            // For AJAX uploads only, add a preview
            addTemporaryPreview(file);
            uploadViaAjax(file);
        }
    }

    /**
     * Add a temporary preview of the pasted image to give immediate feedback
     * Only used for AJAX uploads, not WordPress uploader uploads
     */
    function addTemporaryPreview(file) {
        // Only add preview in media modal
        if (!(window.wp && wp.media && wp.media.frame)) {
            return;
        }

        try {
            // Create a preview container
            var $previewContainer = $('<div class="attachment uploading paste-preview"></div>');
            $previewContainer.css({
                position: 'relative',
                float: 'left',
                margin: '0 10px 20px',
                width: '150px',
                height: '150px',
                backgroundColor: '#f1f1f1',
                textAlign: 'center'
            });

            // Create preview image or icon
            var $previewContent = $('<div class="thumbnail"></div>');
            $previewContent.css({
                width: '100%',
                height: '100%',
                overflow: 'hidden',
                position: 'relative'
            });

            // Add progress overlay
            var $progress = $('<div class="paste-upload-progress"></div>');
            $progress.css({
                position: 'absolute',
                bottom: '0',
                left: '0',
                width: '0%',
                height: '5px',
                backgroundColor: '#2271b1',
                transition: 'width 0.3s'
            });

            // Create reading the file for preview
            var reader = new FileReader();
            reader.onload = function (e) {
                var $img = $('<img />').attr('src', e.target.result);
                $img.css({
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover'
                });
                $previewContent.append($img);
            };
            reader.readAsDataURL(file);

            // Add a "uploading" label
            var $label = $('<div class="filename">Uploading...</div>');
            $label.css({
                position: 'absolute',
                bottom: '5px',
                left: '0',
                right: '0',
                textAlign: 'center',
                color: '#fff',
                textShadow: '0 0 2px rgba(0,0,0,0.5)',
                fontSize: '12px'
            });

            // Assemble the preview
            $previewContainer.append($previewContent);
            $previewContainer.append($progress);
            $previewContainer.append($label);

            // Find the attachments container and prepend our preview
            var $container = $('.attachments');
            if ($container.length) {
                $container.prepend($previewContainer);

                // Store the elements for progress updates
                file._previewContainer = $previewContainer;
                file._progressBar = $progress;
                file._label = $label;

                // Animate progress to indicate upload is happening
                animateProgress(file);
            }
        } catch (error) {
            console.error('Paste plugin: error creating preview', error);
        }
    }

    /**
     * Animate progress bar for visual feedback
     */
    function animateProgress(file) {
        if (!file._progressBar) return;

        var progress = 0;
        var interval = setInterval(function () {
            progress += 5;
            file._progressBar.css('width', progress + '%');

            if (progress >= 100) {
                clearInterval(interval);

                // After completion, remove the temporary preview
                // This should happen when the real attachment is added
                setTimeout(function () {
                    if (file._previewContainer) {
                        file._previewContainer.fadeOut(300, function () {
                            $(this).remove();
                        });
                    }
                }, 500);
            }
        }, 100);

        // Store interval for potential cleanup
        file._progressInterval = interval;
    }

    /**
     * Try WordPress media modal uploaders
     * @returns {boolean} True if a WordPress uploader was successfully used
     */
    function tryWordPressUploaders(file) {
        if (!(window.wp && wp.media && wp.media.frame)) {
            return false;
        }

        console.log('Paste plugin: inspecting available uploaders');

        // Try all possible uploader paths
        var uploaders = [];

        // 1. Direct frame uploader
        if (wp.media.frame.uploader && wp.media.frame.uploader.uploader) {
            uploaders.push({
                name: 'modal uploader',
                uploader: wp.media.frame.uploader.uploader
            });
        }

        // 2. Content browser uploader
        if (wp.media.frame.content &&
            wp.media.frame.content.get &&
            wp.media.frame.content.get() &&
            wp.media.frame.content.get().uploader &&
            wp.media.frame.content.get().uploader.uploader) {

            uploaders.push({
                name: 'browser uploader',
                uploader: wp.media.frame.content.get().uploader.uploader
            });
        }

        // 3. State uploader (for some specific modal states)
        if (wp.media.frame.state &&
            wp.media.frame.state() &&
            wp.media.frame.state().get &&
            wp.media.frame.state().get('uploader')) {

            uploaders.push({
                name: 'state uploader',
                uploader: wp.media.frame.state().get('uploader')
            });
        }

        // 4. Upload page uploader
        var $uploadUI = $('#plupload-upload-ui');
        if ($uploadUI.length && typeof plupload !== 'undefined') {
            try {
                var mediaUploader = $uploadUI.plupload('getUploader');
                if (mediaUploader) {
                    uploaders.push({
                        name: 'upload page uploader',
                        uploader: mediaUploader
                    });
                }
            } catch (error) {
                console.error('Paste plugin: error accessing upload page uploader', error);
            }
        }

        // Try each uploader
        for (var i = 0; i < uploaders.length; i++) {
            var entry = uploaders[i];
            console.log('Paste plugin: trying ' + entry.name);

            try {
                var uploader = entry.uploader;

                // Method 1: Try uploader.addFile
                if (typeof uploader.addFile === 'function') {
                    console.log('Paste plugin: using addFile method on ' + entry.name);
                    uploader.addFile(file);

                    // Let WordPress handle showing the upload progress
                    console.log('Paste plugin: letting WordPress show native upload progress');

                    uploader.refresh();
                    if (uploader.state !== plupload.STARTED) {
                        uploader.start();
                    }

                    return true;
                }

                // Method 2: Try uploader.uploader.addFile (nested structure)
                if (uploader.uploader && typeof uploader.uploader.addFile === 'function') {
                    console.log('Paste plugin: using nested addFile method on ' + entry.name);
                    uploader.uploader.addFile(file);

                    // Let WordPress handle showing the upload progress
                    console.log('Paste plugin: letting WordPress show native upload progress');

                    uploader.uploader.refresh();
                    if (uploader.uploader.state !== plupload.STARTED) {
                        uploader.uploader.start();
                    }

                    return true;
                }

                // Method 3: Try uploader.controller.upload
                if (uploader.controller && typeof uploader.controller.upload === 'function') {
                    console.log('Paste plugin: using controller upload method on ' + entry.name);
                    uploader.controller.upload([file]);

                    return true;
                }

                console.log('Paste plugin: ' + entry.name + ' does not have usable upload methods');
            } catch (error) {
                console.error('Paste plugin: error using ' + entry.name, error);
            }
        }

        // None of the uploaders worked
        console.log('Paste plugin: no compatible WordPress uploader method found');
        return false;
    }

    /**
     * Upload via Ajax as a last resort
     */
    function uploadViaAjax(file) {
        console.log('Paste plugin: no WordPress uploader found, using AJAX fallback');

        var data = new FormData();
        data.append('file', file);
        data.append('action', 'paste_image_uploader_upload');

        $.ajax({
            url: PasteImageUploader.ajax_url,
            type: 'POST',
            data: data,
            processData: false,
            contentType: false,
            xhr: function () {
                var xhr = new window.XMLHttpRequest();

                // Upload progress
                xhr.upload.addEventListener("progress", function (evt) {
                    if (evt.lengthComputable && file._progressBar) {
                        var percentComplete = evt.loaded / evt.total * 100;
                        file._progressBar.css('width', percentComplete + '%');

                        if (file._label) {
                            file._label.text(Math.round(percentComplete) + '%');
                        }
                    }
                }, false);

                return xhr;
            },
            beforeSend: function () {
                console.log('Paste plugin: sending AJAX request');
            },
            success: function (response) {
                console.log('Paste plugin: AJAX success', response);

                // Complete the progress bar
                if (file._progressBar) {
                    file._progressBar.css('width', '100%');
                }
                if (file._label) {
                    file._label.text('Complete');
                }

                // Clear any progress animation interval
                if (file._progressInterval) {
                    clearInterval(file._progressInterval);
                }

                if (response.success) {
                    console.log('Paste plugin: image uploaded via AJAX', response.data.url);

                    // Try to integrate with the media modal if possible
                    if (window.wp && wp.media && wp.media.frame) {
                        try {
                            // Create attachment model from response
                            var attachment = new wp.media.model.Attachment(response.data.attachment);

                            // Add to selection (makes it the active selected item)
                            if (wp.media.frame.state().get('selection')) {
                                wp.media.frame.state().get('selection').add(attachment);
                                console.log('Paste plugin: attachment selected in modal');
                            }

                            // Add to library (makes it visible in the grid)
                            if (wp.media.frame.state().get('library')) {
                                wp.media.frame.state().get('library').add(attachment);
                                console.log('Paste plugin: attachment added to library');

                                // Force the library to show the new item
                                var contentState = wp.media.frame.content.get();
                                if (contentState && contentState.collection) {
                                    // Reset query to refresh view
                                    contentState.collection.props.set('query', false);
                                    contentState.collection.props.set('query', {});
                                }
                            }

                            // Remove the temporary preview with a slight delay
                            setTimeout(function () {
                                if (file._previewContainer) {
                                    file._previewContainer.fadeOut(300, function () {
                                        $(this).remove();
                                    });
                                }
                            }, 1000);

                        } catch (error) {
                            console.error('Paste plugin: error adding to media library', error);
                        }
                    }
                } else {
                    console.error('Paste plugin: upload error', response.data);

                    // Show error in preview
                    if (file._label) {
                        file._label.text('Error').css('color', 'red');
                    }
                    if (file._progressBar) {
                        file._progressBar.css('backgroundColor', 'red');
                    }
                }
            },
            error: function (jqXHR, textStatus, errorThrown) {
                console.error('Paste plugin: AJAX error', textStatus, errorThrown);

                // Show error in preview
                if (file._label) {
                    file._label.text('Error: ' + textStatus).css('color', 'red');
                }
                if (file._progressBar) {
                    file._progressBar.css('backgroundColor', 'red');
                }
            }
        });
    }
})(jQuery); 