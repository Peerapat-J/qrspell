// Generated from docs/analytics/event-schema-v1.json. Do not edit by hand.
const schema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "QRSpell analytics event contract",
  "schema_version": 1,
  "provider": "posthog",
  "environment_values": [
    "sandbox",
    "production"
  ],
  "provider_transport_property_allowlist": [
    "token",
    "distinct_id",
    "$lib",
    "$lib_version",
    "$process_person_profile",
    "$geoip_disable"
  ],
  "events": {
    "site_page_viewed": {
      "required": [
        "analytics_schema_version",
        "environment",
        "route"
      ],
      "properties": {
        "analytics_schema_version": {
          "const": 1
        },
        "environment": {
          "enum": [
            "sandbox",
            "production"
          ]
        },
        "route": {
          "enum": [
            "home",
            "generator",
            "changelog",
            "privacy",
            "helpcenter",
            "legal",
            "acknowledgements"
          ]
        }
      }
    },
    "app_store_clicked": {
      "required": [
        "analytics_schema_version",
        "environment",
        "source"
      ],
      "properties": {
        "analytics_schema_version": {
          "const": 1
        },
        "environment": {
          "enum": [
            "sandbox",
            "production"
          ]
        },
        "source": {
          "enum": [
            "header",
            "homepage_hero",
            "generator_cta",
            "footer"
          ]
        }
      }
    },
    "generator_viewed": {
      "required": [
        "analytics_schema_version",
        "environment"
      ],
      "properties": {
        "analytics_schema_version": {
          "const": 1
        },
        "environment": {
          "enum": [
            "sandbox",
            "production"
          ]
        }
      }
    },
    "generator_started": {
      "required": [
        "analytics_schema_version",
        "environment"
      ],
      "properties": {
        "analytics_schema_version": {
          "const": 1
        },
        "environment": {
          "enum": [
            "sandbox",
            "production"
          ]
        }
      }
    },
    "qr_generation_completed": {
      "required": [
        "analytics_schema_version",
        "environment",
        "outcome",
        "module_shape",
        "finder_shape",
        "export_size",
        "reliability",
        "center_type",
        "warning_count"
      ],
      "properties": {
        "analytics_schema_version": {
          "const": 1
        },
        "environment": {
          "enum": [
            "sandbox",
            "production"
          ]
        },
        "outcome": {
          "enum": [
            "verified",
            "capacity_rejected",
            "decode_failed",
            "decoded_mismatch",
            "render_failed",
            "center_image_rejected"
          ]
        },
        "module_shape": {
          "enum": [
            "square",
            "rounded",
            "dots"
          ]
        },
        "finder_shape": {
          "enum": [
            "square",
            "rounded",
            "circle"
          ]
        },
        "export_size": {
          "enum": [
            256,
            512,
            1024
          ]
        },
        "reliability": {
          "enum": [
            "M",
            "Q",
            "H"
          ]
        },
        "center_type": {
          "enum": [
            "none",
            "text",
            "image"
          ]
        },
        "warning_count": {
          "enum": [
            0,
            1,
            2,
            3
          ]
        }
      }
    },
    "qr_exported": {
      "required": [
        "analytics_schema_version",
        "environment",
        "method",
        "module_shape",
        "finder_shape",
        "export_size",
        "reliability",
        "center_type"
      ],
      "properties": {
        "analytics_schema_version": {
          "const": 1
        },
        "environment": {
          "enum": [
            "sandbox",
            "production"
          ]
        },
        "method": {
          "enum": [
            "copy",
            "download"
          ]
        },
        "module_shape": {
          "enum": [
            "square",
            "rounded",
            "dots"
          ]
        },
        "finder_shape": {
          "enum": [
            "square",
            "rounded",
            "circle"
          ]
        },
        "export_size": {
          "enum": [
            256,
            512,
            1024
          ]
        },
        "reliability": {
          "enum": [
            "M",
            "Q",
            "H"
          ]
        },
        "center_type": {
          "enum": [
            "none",
            "text",
            "image"
          ]
        }
      }
    },
    "generator_reset": {
      "required": [
        "analytics_schema_version",
        "environment"
      ],
      "properties": {
        "analytics_schema_version": {
          "const": 1
        },
        "environment": {
          "enum": [
            "sandbox",
            "production"
          ]
        }
      }
    }
  },
  "forbidden_property_names": [
    "$current_url",
    "$pathname",
    "$referrer",
    "$referring_domain",
    "$set",
    "$set_once",
    "distinct_id",
    "content",
    "payload",
    "qr_content",
    "center_text",
    "center_image",
    "filename",
    "clipboard",
    "url",
    "query",
    "hash",
    "error",
    "error_message",
    "stack"
  ],
  "forbidden_value_kinds": [
    "array",
    "object",
    "file",
    "blob",
    "dom_node",
    "data_url",
    "free_form_text"
  ],
  "campaign_attribution": {
    "utm_keys": [
      "utm_source",
      "utm_medium",
      "utm_campaign"
    ],
    "max_query_length": 2048,
    "max_value_length": 64,
    "referrer": "disabled",
    "persistence": "none"
  }
};

function freeze(value) {
    if (value && typeof value === "object") {
        for (const item of Object.values(value)) freeze(item);
        Object.freeze(value);
    }
    return value;
}

export const analyticsSchema = freeze(schema);
