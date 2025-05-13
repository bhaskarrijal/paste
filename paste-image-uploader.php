<?php
/**
 * Plugin Name: Paste Image Uploader
 * Plugin URI: https://bhaskarrijal.me/paste
 * Description: Extremely lighweight and simple plugin to paste images directly into the WordPress media library upload modal.
 * Version: 1.0.0
 * Author: Bhaskar Rijal
 * Author URI: https://bhaskarrijal.me
 * License: GPL2
 * Text Domain: paste-image-uploader
 * Domain Path: /languages
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit; // exit if accessed directly
}

class Paste_Image_Uploader {

    /**
     * constructor
     */
    public function __construct() {
        add_action( 'admin_enqueue_scripts', [ $this, 'enqueue_assets' ] );
        add_action( 'wp_ajax_paste_image_uploader_upload', [ $this, 'handle_ajax_upload' ] );
        add_action( 'admin_menu', [ $this, 'add_settings_page' ] );
        add_action( 'admin_init', [ $this, 'register_settings' ] );
        add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), [ $this, 'add_settings_link' ] );
        add_filter( 'auto_update_plugin', [ $this, 'auto_update_plugin' ], 10, 2 );
    }

    /**
     * enqueue javascript and css assets
     *
     * @param string $hook The current admin page
     */
    public function enqueue_assets( $hook ) {
        $options = get_option( 'paste_image_uploader_options', [] );
        if ( isset( $options['enable_paste_upload'] ) && ! $options['enable_paste_upload'] ) {
            return;
        }
        
        // load wordpress media scripts
        wp_enqueue_media(); 
        
        // enqueue dashicons (needed for our tooltip icon)
        wp_enqueue_style('dashicons');
        
        // enqueue assets for paste functionality
        wp_enqueue_script(
            'paste-image-uploader-js',
            plugin_dir_url( __FILE__ ) . 'assets/js/paste-image-uploader.js',
            [ 'jquery', 'media-views' ],  // add media-views dependency
            '0.1.0',
            true
        );
        
        wp_localize_script(
            'paste-image-uploader-js',
            'PasteImageUploader',
            [
                'ajax_url' => admin_url( 'admin-ajax.php' ),
                'nonce' => wp_create_nonce('paste_image_uploader_nonce'),
                'strings' => [
                    'drop_text' => __( 'Drop files to upload', 'paste-image-uploader' ),
                    'paste_shortcut' => __( 'Press Ctrl+V or Cmd+V to paste image(s) from clipboard', 'paste-image-uploader' ),
                    'paste_powered_by' => __( 'Powered by Paste Image Uploader plugin', 'paste-image-uploader' ),
                ]
            ]
        );
        
        wp_enqueue_style(
            'paste-image-uploader-css',
            plugin_dir_url( __FILE__ ) . 'assets/css/paste-image-uploader.css',
            [],
            '0.1.0'
        );
    }

    /**
     * handle ajax image upload from clipboard
     */
    public function handle_ajax_upload() {
        // Verify nonce for security
        if ( ! isset( $_POST['nonce'] ) || ! wp_verify_nonce( sanitize_text_field( $_POST['nonce'] ), 'paste_image_uploader_nonce' ) ) {
            wp_send_json_error( __( 'Security check failed.', 'paste-image-uploader' ) );
        }
        
        $options = get_option( 'paste_image_uploader_options', [] );
        // Only block if explicitly disabled.
        if ( isset( $options['enable_paste_upload'] ) && ! $options['enable_paste_upload'] ) {
            wp_send_json_error( __( 'Feature disabled.', 'paste-image-uploader' ) );
        }
        
        // Validate file exists
        if ( empty( $_FILES['file'] ) ) {
            wp_send_json_error( 'No file found in clipboard data.' );
        }
        
        // Use WordPress's built-in file handling which includes sanitization
        $file = $_FILES['file'];
        $overrides = [ 'test_form' => false ];
        $file_return = wp_handle_upload( $file, $overrides );

        if ( isset( $file_return['error'] ) ) {
            wp_send_json_error( $file_return['error'] );
        }

        $filename = $file_return['file'];
        $attachment = [
            'post_mime_type' => $file_return['type'],
            'post_title'     => sanitize_file_name( pathinfo( $filename, PATHINFO_FILENAME ) ),
            'post_content'   => '',
            'post_status'    => 'inherit',
        ];
        $attach_id = wp_insert_attachment( $attachment, $file_return['url'] );

        require_once ABSPATH . 'wp-admin/includes/image.php';
        $attach_data = wp_generate_attachment_metadata( $attach_id, $file_return['file'] );
        wp_update_attachment_metadata( $attach_id, $attach_data );

        wp_send_json_success(
            [
                'id'  => $attach_id,
                'url' => $file_return['url'],
            ]
        );
    }

    /**
     * add settings page under Settings
     */
    public function add_settings_page() {
        add_options_page(
            __( 'Paste Image Uploader Settings', 'paste-image-uploader' ),
            __( 'Paste Image Uploader', 'paste-image-uploader' ),
            'manage_options',
            'paste',
            [ $this, 'render_settings_page' ]
        );
    }

    /**
     * register plugin settings
     */
    public function register_settings() {
        register_setting(
            'paste_image_uploader_options',
            'paste_image_uploader_options',
            [ $this, 'sanitize_options' ]
        );

        add_settings_section(
            'paste_image_uploader_main',
            __( 'Main Settings', 'paste' ),
            [ $this, 'settings_section_cb' ],
            'paste'
        );

        add_settings_field(
            'enable_paste_upload',
            __( 'Enable Plugin', 'paste' ),
            [ $this, 'field_enable_paste_upload_cb' ],
            'paste',
            'paste_image_uploader_main'
        );
    }

    /**
     * settings section callback
     */
    public function settings_section_cb() {
        echo '<p>' . esc_html__( 'Configure the settings for the Paste Image Uploader plugin.', 'paste-image-uploader' ) . '</p>';
    }

    /**
     * field callback for enable_paste_upload
     */
    public function field_enable_paste_upload_cb() {
        $options = get_option( 'paste_image_uploader_options' );
        $enabled = isset( $options['enable_paste_upload'] ) ? (bool) $options['enable_paste_upload'] : true;
        ?>
        <input type="checkbox" name="paste_image_uploader_options[enable_paste_upload]" value="1" <?php checked( $enabled, true ); ?> />
        <label for="enable_paste_upload"><?php esc_html_e( 'Enable the paste feature', 'paste-image-uploader' ); ?></label>
        <?php
    }

    /**
     * sanitize options
     */
    public function sanitize_options( $input ) {
        $output = [];
        $output['enable_paste_upload'] = isset( $input['enable_paste_upload'] ) && $input['enable_paste_upload'] ? 1 : 0;
        return $output;
    }

    /**
     * rnder settings page
     */
    public function render_settings_page() {
        ?>
        <div class="wrap">
            <h1><?php esc_html_e( 'Paste Image Uploader Settings', 'paste-image-uploader' ); ?></h1>
            <form action="options.php" method="post">
                <?php
                settings_fields( 'paste_image_uploader_options' );
                do_settings_sections( 'paste' );
                submit_button();
                ?>
            </form>
        </div>
        <?php
    }

    /**
     * Add settings link to plugin action links
     * 
     * @param array $links Existing plugin action links
     * @return array Modified plugin action links
     */
    public function add_settings_link( $links ) {
        $settings_link = '<a href="' . admin_url( 'options-general.php?page=paste' ) . '">' . __( 'Settings', 'paste-image-uploader' ) . '</a>';
        array_unshift( $links, $settings_link );
        return $links;
    }

    /**
     * Control auto-update for this plugin
     * 
     * @param bool $update Whether to update the plugin or not
     * @param object $item The plugin update offer
     * @return bool Whether to update the plugin or not
     */
    public function auto_update_plugin( $update, $item ) {
        // If this is our plugin
        if ( isset( $item->slug ) && $item->slug === plugin_basename( __DIR__ ) ) {
            // Always return true to enable auto-updates by default
            return true;
        }
        
        // For other plugins, return the default
        return $update;
    }
}

// Initialize plugin.
new Paste_Image_Uploader(); 