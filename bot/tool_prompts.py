"""
Dynamic tool guidance appended to the system prompt at call time.

For each tool there are two prompt snippets:
  - "enabled"  → tells the bot how to use the tool
  - "disabled" → tells the bot how to handle the situation gracefully without the tool

build_tool_guidance(enabled_names) returns a block that is appended to the
system prompt so the LLM always knows exactly what it can and cannot do.
"""

# Per-tool prompt guidance
TOOL_GUIDANCE: dict[str, dict[str, str]] = {
    "transfer_to_human": {
        "enabled": (
            "CALL TRANSFER (available): When the prospect shows strong interest, "
            "wants a demo or pricing, or asks questions beyond your scope — say a "
            "natural handoff phrase (e.g., 'Let me connect you with someone on our team.') "
            "then call transfer_to_human. Always speak before transferring, never silently."
        ),
        "disabled": (
            "CALL TRANSFER (not available): You cannot transfer calls to a human agent. "
            "If someone requests to speak with a person or a representative, respond "
            "professionally: 'I'm not able to transfer you directly right now, but I'd "
            "be happy to note your interest and have someone from our team follow up with you. "
            "Could I get the best way to reach you?' Stay helpful and ensure they feel heard."
        ),
    },
    "end_call": {
        "enabled": (
            "ENDING CALLS (available): When the conversation concludes naturally, the person "
            "says goodbye, or declines — say a brief professional farewell then call end_call. "
            "Never hang up without calling end_call."
        ),
        "disabled": (
            "ENDING CALLS: When the conversation concludes, say a brief professional farewell "
            "such as 'Thank you for your time. Have a great day.' The call will disconnect "
            "automatically after a short pause."
        ),
    },
    "send_email": {
        "enabled": (
            "EMAIL FOLLOW-UP (available): If the prospect asks for more information or wants "
            "something sent to them — offer to send a follow-up email and call send_email with "
            "a clear summary of their interest and any relevant details from the conversation."
        ),
        "disabled": (
            "EMAIL FOLLOW-UP (not available): You cannot send emails at this time. If someone "
            "asks for information to be sent to them, respond: 'I'm not able to send emails "
            "right now, but I can make sure our team follows up with you directly. Would that "
            "work for you?' Keep the conversation moving forward."
        ),
    },
    "submit_call_analysis": {
        "enabled": (
            "CALL ANALYSIS (available): Before ending every call, you MUST call "
            "submit_call_analysis to record structured insights about the conversation. "
            "Assess interest level, objections, pain points, company size, sentiment (0-100), "
            "pitch delivery quality (0-100), and any extracted info (decision maker, current "
            "provider, monthly inquiries). Call this BEFORE calling end_call."
        ),
        "disabled": (
            "CALL ANALYSIS (not available): Call analysis is disabled. Do not attempt to "
            "analyze or submit call data. Simply end the call normally when the conversation "
            "concludes."
        ),
    },
}

# All known tool names (defines the order they appear in the prompt)
ALL_TOOLS = ["transfer_to_human", "end_call", "send_email", "submit_call_analysis"]


def build_tool_guidance(enabled_names: list[str], tool_configs: dict = None) -> str:
    """Build the tool-guidance block to append to the system prompt.

    Args:
        enabled_names: List of tool names that are enabled for this org.
        tool_configs: Optional dict of tool settings (e.g., from fetch_tool_configs).
                     Used to customize guidance for tools with configurable fields.

    Returns:
        A multi-line string with one guidance paragraph per tool.
    """
    tool_configs = tool_configs or {}
    lines = ["\n\nTOOL BEHAVIOR RULES"]
    for tool in ALL_TOOLS:
        if tool not in TOOL_GUIDANCE:
            continue
        key = "enabled" if tool in enabled_names else "disabled"

        # Special handling for submit_call_analysis: customize based on selected_fields
        if tool == "submit_call_analysis" and tool in enabled_names:
            guidance = _build_analysis_guidance(tool_configs)
            if guidance:
                lines.append(f"\n- {guidance}")
                continue

        # Default guidance for all other tools
        lines.append(f"\n- {TOOL_GUIDANCE[tool][key]}")
    return "\n".join(lines)


def _build_analysis_guidance(tool_configs: dict) -> str:
    """Build customized guidance for submit_call_analysis based on selected fields.

    Args:
        tool_configs: Tool configurations dict (maps tool name → settings).

    Returns:
        Customized guidance mentioning only the selected analysis fields.
    """
    analysis_config = tool_configs.get("submit_call_analysis", {})
    selected_fields = analysis_config.get("selected_fields", [])

    # Field descriptions for the prompt
    field_descriptions = {
        "interest_level": "interest level (high/medium/low/none)",
        "want_demo": "if they want a demo",
        "transferred_to_human": "if the call was transferred",
        "demo_booked": "if a demo was booked",
        "qualified_lead": "whether they're a qualified lead",
        "objections": "objections they raised",
        "pain_points_mentioned": "pain points mentioned",
        "company_size_category": "company size",
        "call_sentiment": "overall sentiment score (0-100)",
        "customer_satisfaction_estimate": "estimated satisfaction (0-100)",
        "pitch_delivery_score": "your pitch quality (0-100)",
        "extracted_info": "extracted info (decision maker, current provider, etc.)",
    }

    if not selected_fields:
        # If no fields selected, use default guidance
        return TOOL_GUIDANCE["submit_call_analysis"]["enabled"]

    # Build list of fields to analyze
    field_list = []
    for field in selected_fields:
        if field in field_descriptions:
            field_list.append(field_descriptions[field])

    if not field_list:
        # Fallback if no recognized fields
        return TOOL_GUIDANCE["submit_call_analysis"]["enabled"]

    # Build the customized guidance
    fields_text = ", ".join(field_list)
    guidance = (
        "CALL ANALYSIS (available): Before ending every call, you MUST call "
        "submit_call_analysis to record structured insights. Assess: "
        f"{fields_text}. "
        "Call this BEFORE calling end_call."
    )
    return guidance
