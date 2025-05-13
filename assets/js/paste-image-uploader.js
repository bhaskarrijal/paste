(function ($) {
    console.log('Paste Image Uploader plugin: script loaded');

    $(document).ready(function () {
        if (typeof wp !== 'undefined' && wp.media && wp.media.view) {
            var originalUploaderInline = wp.media.view.UploaderInline;

            wp.media.view.UploaderInline = originalUploaderInline.extend({
                render: function () {
                    originalUploaderInline.prototype.render.apply(this, arguments);

                    console.log('Paste Image Uploader plugin: Customizing uploader text');

                    try {
                        this.$el.find('.paste-tooltip-icon').remove();

                        this.$el.find('.paste-shortcut').remove();
                        $('.media-modal .paste-shortcut').remove();

                        var $orText = this.$el.find('.upload-ui p, .upload-ui .upload-instructions p').filter(function () {
                            return $(this).text().trim() === 'or';
                        }).first();

                        if ($orText.length) {
                            var $shortcutText = $('<p class="paste-shortcut"></p>')
                                .text(PasteImageUploader.strings.paste_shortcut)
                                .append(' <span class="dashicons dashicons-info paste-tooltip-icon" title="' +
                                    PasteImageUploader.strings.paste_powered_by +
                                    '"></span>')
                                .css('margin-bottom', '8px');

                            $orText.before($shortcutText);

                            if ($.fn.tooltip) {
                                $('.paste-tooltip-icon').tooltip();
                            }
                        }
                    } catch (e) {
                        console.error('Paste Image Uploader plugin: Error customizing uploader text', e);
                    }

                    return this;
                }
            });

            if (wp.media.view.UploaderWindow) {
                var originalUploaderWindow = wp.media.view.UploaderWindow;

                wp.media.view.UploaderWindow = originalUploaderWindow.extend({
                    render: function () {
                        originalUploaderWindow.prototype.render.apply(this, arguments);

                        this.$el.find('.paste-shortcut').remove();

                        return this;
                    }
                });
            }

            console.log('Paste Image Uploader plugin: Extended uploader views');
        } else {
            console.log('Paste Image Uploader plugin: wp.media.view not available');
        }
    });

    $(document).on('paste', function (e) {
        console.log('Paste Image Uploader plugin: paste event detected');

        var items = (e.originalEvent.clipboardData || e.clipboardData).items;
        if (!items || items.length === 0) {
            console.log('Paste Image Uploader plugin: no clipboard items found');
            return;
        }

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (item.type.indexOf('image') !== -1) {
                var file = item.getAsFile();
                console.log('Paste Image Uploader plugin: image file detected', file);

                var ext = item.type.split('/')[1] || 'png';
                var fileName = 'pasted-image-' + new Date().getTime() + '.' + ext;

                try {
                    file = new File([file], fileName, { type: file.type });
                } catch (e) {
                    file.name = fileName;
                }

                uploadPastedImage(file);
            }
        }
    });

    /**
     * handle uploading a pasted image through various available methods
     */
    function uploadPastedImage(file) {
        var usingWordPress = tryWordPressUploaders(file);

        if (!usingWordPress) {
            addTemporaryPreview(file);
            uploadViaAjax(file);
        }
    }

    /**
     * add a temporary preview of the pasted image to give immediate feedback
     * only used for ajax uploads, not wordpress uploader uploads
     */
    function addTemporaryPreview(file) {
        if (!(window.wp && wp.media && wp.media.frame)) {
            return;
        }

        try {
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

            var $previewContent = $('<div class="thumbnail"></div>');
            $previewContent.css({
                width: '100%',
                height: '100%',
                overflow: 'hidden',
                position: 'relative'
            });

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

            $previewContainer.append($previewContent);
            $previewContainer.append($progress);
            $previewContainer.append($label);

            var $container = $('.attachments');
            if ($container.length) {
                $container.prepend($previewContainer);

                file._previewContainer = $previewContainer;
                file._progressBar = $progress;
                file._label = $label;

                animateProgress(file);
            }
        } catch (error) {
            console.error('Paste Image Uploader plugin: error creating preview', error);
        }
    }

    /**
     * animate progress bar for visual feedback
     */
    function animateProgress(file) {
        if (!file._progressBar) return;

        var progress = 0;
        var interval = setInterval(function () {
            progress += 5;
            file._progressBar.css('width', progress + '%');

            if (progress >= 100) {
                clearInterval(interval);

                setTimeout(function () {
                    if (file._previewContainer) {
                        file._previewContainer.fadeOut(300, function () {
                            $(this).remove();
                        });
                    }
                }, 500);
            }
        }, 100);

        file._progressInterval = interval;
    }

    /**
     * try wordpress media modal uploaders
     * @returns {boolean} True if a WordPress uploader was successfully used
     */
    function tryWordPressUploaders(file) {
        if (!(window.wp && wp.media && wp.media.frame)) {
            return false;
        }

        console.log('Paste Image Uploader plugin: inspecting available uploaders');

        var uploaders = [];

        if (wp.media.frame.uploader && wp.media.frame.uploader.uploader) {
            uploaders.push({
                name: 'modal uploader',
                uploader: wp.media.frame.uploader.uploader
            });
        }

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

        if (wp.media.frame.state &&
            wp.media.frame.state() &&
            wp.media.frame.state().get &&
            wp.media.frame.state().get('uploader')) {

            uploaders.push({
                name: 'state uploader',
                uploader: wp.media.frame.state().get('uploader')
            });
        }

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
                console.error('Paste Image Uploader plugin: error accessing upload page uploader', error);
            }
        }

        for (var i = 0; i < uploaders.length; i++) {
            var entry = uploaders[i];
            console.log('Paste Image Uploader plugin: trying ' + entry.name);

            try {
                var uploader = entry.uploader;

                if (typeof uploader.addFile === 'function') {
                    console.log('Paste Image Uploader plugin: using addFile method on ' + entry.name);
                    uploader.addFile(file);

                    console.log('Paste Image Uploader plugin: letting WordPress show native upload progress');

                    uploader.refresh();
                    if (uploader.state !== plupload.STARTED) {
                        uploader.start();
                    }

                    return true;
                }

                if (uploader.uploader && typeof uploader.uploader.addFile === 'function') {
                    console.log('Paste Image Uploader plugin: using nested addFile method on ' + entry.name);
                    uploader.uploader.addFile(file);

                    console.log('Paste Image Uploader plugin: letting WordPress show native upload progress');

                    uploader.uploader.refresh();
                    if (uploader.uploader.state !== plupload.STARTED) {
                        uploader.uploader.start();
                    }

                    return true;
                }

                if (uploader.controller && typeof uploader.controller.upload === 'function') {
                    console.log('Paste Image Uploader plugin: using controller upload method on ' + entry.name);
                    uploader.controller.upload([file]);

                    return true;
                }

                console.log('Paste Image Uploader plugin: ' + entry.name + ' does not have usable upload methods');
            } catch (error) {
                console.error('Paste Image Uploader plugin: error using ' + entry.name, error);
            }
        }

        console.log('Paste Image Uploader plugin: no compatible WordPress uploader method found');
        return false;
    }

    /**
     * upload via ajax as a last resort
     */
    function uploadViaAjax(file) {
        console.log('Paste Image Uploader plugin: no WordPress uploader found, using AJAX fallback');

        var data = new FormData();
        data.append('file', file);
        data.append('action', 'paste_image_uploader_upload');
        data.append('nonce', PasteImageUploader.nonce);

        $.ajax({
            url: PasteImageUploader.ajax_url,
            type: 'POST',
            data: data,
            processData: false,
            contentType: false,
            xhr: function () {
                var xhr = new window.XMLHttpRequest();

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
                console.log('Paste Image Uploader plugin: sending AJAX request');
            },
            success: function (response) {
                console.log('Paste Image Uploader plugin: AJAX success', response);

                if (file._progressBar) {
                    file._progressBar.css('width', '100%');
                }
                if (file._label) {
                    file._label.text('Complete');
                }

                if (file._progressInterval) {
                    clearInterval(file._progressInterval);
                }

                if (response.success) {
                    console.log('Paste Image Uploader plugin: image uploaded via AJAX', response.data.url);

                    if (window.wp && wp.media && wp.media.frame) {
                        try {
                            var attachment = new wp.media.model.Attachment(response.data.attachment);

                            if (wp.media.frame.state().get('selection')) {
                                wp.media.frame.state().get('selection').add(attachment);
                                console.log('Paste Image Uploader plugin: attachment selected in modal');
                            }

                            if (wp.media.frame.state().get('library')) {
                                wp.media.frame.state().get('library').add(attachment);
                                console.log('Paste Image Uploader plugin: attachment added to library');

                                var contentState = wp.media.frame.content.get();
                                if (contentState && contentState.collection) {
                                    contentState.collection.props.set('query', false);
                                    contentState.collection.props.set('query', {});
                                }
                            }

                            setTimeout(function () {
                                if (file._previewContainer) {
                                    file._previewContainer.fadeOut(300, function () {
                                        $(this).remove();
                                    });
                                }
                            }, 1000);

                        } catch (error) {
                            console.error('Paste Image Uploader plugin: error adding to media library', error);
                        }
                    }
                } else {
                    console.error('Paste Image Uploader plugin: upload error', response.data);

                    if (file._label) {
                        file._label.text('Error').css('color', 'red');
                    }
                    if (file._progressBar) {
                        file._progressBar.css('backgroundColor', 'red');
                    }
                }
            },
            error: function (jqXHR, textStatus, errorThrown) {
                console.error('Paste Image Uploader plugin: AJAX error', textStatus, errorThrown);

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