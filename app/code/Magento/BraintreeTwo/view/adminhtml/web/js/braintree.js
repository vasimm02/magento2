/**
 * Copyright © 2015 Magento. All rights reserved.
 * See COPYING.txt for license details.
 */
/*browser:true*/
/*global define*/
define([
    'jquery',
    'uiComponent',
    'Magento_Ui/js/modal/alert',
    'Magento_Ui/js/lib/view/utils/dom-observer',
    'mage/translate',
    'Magento_BraintreeTwo/js/validator'
], function ($, Class, alert, domObserver, $t, validator) {
    'use strict';

    return Class.extend({

        defaults: {
            $selector: null,
            selector: 'edit_form',
            container: 'payment_form_braintreetwo',
            active: false,
            scriptLoaded: false,
            braintree: null,
            selectedCardType: null,
            imports: {
                onActiveChange: 'active'
            }
        },

        /**
         * Set list of observable attributes
         * @returns {exports.initObservable}
         */
        initObservable: function () {
            var self = this;

            validator.setConfig(this);

            self.$selector = $('#' + self.selector);
            this._super()
                .observe([
                    'active',
                    'scriptLoaded',
                    'selectedCardType'
                ]);

            // re-init payment method events
            self.$selector.off('changePaymentMethod.' + this.code)
                .on('changePaymentMethod.' + this.code, this.changePaymentMethod.bind(this));

            // listen block changes
            domObserver.get('#' + self.container, function () {
                if (self.scriptLoaded()) {
                    self.$selector.off('submit');
                    self.initBraintree();
                }
            });

            return this;
        },

        /**
         * Enable/disable current payment method
         * @param {Object} event
         * @param {String} method
         * @returns {exports.changePaymentMethod}
         */
        changePaymentMethod: function (event, method) {
            this.active(method === this.code);

            return this;
        },

        /**
         * Triggered when payment changed
         * @param {Boolean} isActive
         */
        onActiveChange: function (isActive) {
            if (!isActive) {

                return;
            }
            this.disableEventListeners();
            window.order.addExcludedPaymentMethod(this.code);

            if (!this.clientToken) {
                this.error($.mage.__('This payment is not available'));

                return;
            }

            if (!this.scriptLoaded()) {
                this.loadScript();
            }

            this.enableEventListeners();
        },

        /**
         * Load external Braintree SDK
         */
        loadScript: function () {
            var self = this,
                state = self.scriptLoaded;

            $('body').trigger('processStart');
            require([this.sdkUrl], function (braintree) {
                state(true);
                self.braintree = braintree;
                self.initBraintree();
                $('body').trigger('processStop');
            });
        },

        /**
         * Setup Braintree SDK
         */
        initBraintree: function () {
            var self = this,
                fields = {
                    number: {
                        selector: self.getSelector('cc_number')
                    },
                    expirationMonth: {
                        selector: self.getSelector('cc_exp_month'),
                        placeholder: $t('MM')
                    },
                    expirationYear: {
                        selector: self.getSelector('cc_exp_year'),
                        placeholder: $t('YY')
                    },

                    /**
                     * Triggered when hosted field is changed
                     * @param {Object} event
                     */
                    onFieldEvent: function (event) {
                        var $cardType = $('#' + self.container).find('.icon-type');

                        if (event.isEmpty === false) {
                            self.validateCardType();
                        }

                        if (event.type !== 'fieldStateChange') {

                            return false;
                        }

                        // remove previously set classes
                        $cardType.attr('class', 'icon-type');
                        self.selectedCardType(null);

                        if (event.card) {
                            $cardType.addClass('icon-type-' + event.card.type);
                            self.selectedCardType(
                                validator.getMageCardType(event.card.type, self.getCcAvailableTypes())
                            );
                        }
                    }
                };

            try {
                $('body').trigger('processStart');

                if (self.useCvv) {
                    fields.cvv = {
                        selector: self.getSelector('cc_cid')
                    };
                }

                self.braintree.setup(self.clientToken, 'custom', {
                    id: self.selector,
                    hostedFields: fields,

                    /**
                     * Triggered when sdk was loaded
                     */
                    onReady: function () {
                        $('body').trigger('processStop');
                    },

                    /**
                     * Callback for success response
                     * @param {Object} response
                     */
                    onPaymentMethodReceived: function (response) {
                        if (!self.$selector.validate().errorList.length && self.validateCardType()) {
                            self.setPaymentDetails(response);
                            $('#' + self.selector).trigger('realOrder');
                        }
                    },

                    /**
                     * Error callback
                     * @param {Object} response
                     */
                    onError: function (response) {
                        self.error(response.message);
                    }
                });
            } catch (e) {
                $('body').trigger('processStop');
                self.error(e.message);
            }
        },

        /**
         * Show alert message
         * @param {String} message
         */
        error: function (message) {
            alert({
                content: message
            });
        },

        /**
         * Enable form event listeners
         */
        enableEventListeners: function () {
            this.$selector.on('submitOrder', this.submitOrder.bind(this));
        },

        /**
         * Disable form event listeners
         */
        disableEventListeners: function () {
            this.$selector.off('submitOrder');
            this.$selector.off('submit');
        },

        /**
         * Store payment details
         * @param {Object} data
         */
        setPaymentDetails: function (data) {
            var $container = $('#' + this.container);

            $container.find('[name="payment[payment_method_nonce]"]').val(data.nonce);
        },

        /**
         * Trigger Braintree order submit
         */
        submitOrder: function () {
            this.$selector.validate().form();
            this.$selector.trigger('afterValidate.beforeSubmit');
            $('body').trigger('processStop');
            $('#' + this.container).find('[type="submit"]').trigger('click');
        },

        /**
         * Get list of currently available card types
         * @returns {Array}
         */
        getCcAvailableTypes: function () {
            var types = [],
                $options = $(this.getSelector('cc_type')).find('option');

            $.map($options, function (option) {
                types.push($(option).val());
            });

            return types;
        },

        /**
         * Validate current entered card type
         * @returns {Boolean}
         */
        validateCardType: function () {
            var $input = $(this.getSelector('cc_number'));

            $input.removeClass('braintree-hosted-fields-invalid');

            if (!this.selectedCardType()) {
                $input.addClass('braintree-hosted-fields-invalid');

                return false;
            }
            $(this.getSelector('cc_type')).val(this.selectedCardType());

            return true;
        },

        /**
         * Get jQuery selector
         * @param {String} field
         * @returns {String}
         */
        getSelector: function (field) {
            return '#' + this.code + '_' + field;
        }
    });
});
