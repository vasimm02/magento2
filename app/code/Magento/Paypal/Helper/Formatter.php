<?php
/**
 * Copyright © 2015 Magento. All rights reserved.
 * See COPYING.txt for license details.
 */
namespace Magento\Paypal\Helper;

/**
 * Class Formatter
 * @package Magento\Paypal\Helper
 */
trait Formatter
{
    /**
     * Format price to 0.00 format
     *
     * @param mixed $price
     * @return string
     */
    public function formatPrice($price)
    {
        return sprintf('%.2F', $price);
    }
}
