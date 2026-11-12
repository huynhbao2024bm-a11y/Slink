use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde_json::{Map, Value, json};
use std::collections::HashSet;

const MAX_JSON_BYTES: usize = 256 * 1024;
const MAX_SAFE_INTEGER: i128 = 9_007_199_254_740_991;
const MAX_CONDITIONS: usize = 100;
const MAX_ACTIONS: usize = 50;

fn invalid(message: impl Into<String>) -> Error {
    Error::new(Status::InvalidArg, message.into())
}

fn is_record(value: &Value) -> bool {
    value.is_object()
}

fn identifier(value: &str, max_length: usize) -> bool {
    !value.is_empty()
        && value.len() <= max_length
        && value.chars().enumerate().all(|(index, ch)| {
            ch.is_ascii_alphanumeric() || (index > 0 && matches!(ch, '.' | '_' | ':' | '-'))
        })
}

fn required_string<'a>(value: &'a Value, key: &str, message: &str) -> Result<&'a str> {
    value
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| invalid(message))
}

fn workflow_conditions(workflow: &Value) -> Result<Vec<(Vec<String>, String, Option<Value>)>> {
    let conditions = workflow
        .get("conditions")
        .cloned()
        .unwrap_or_else(|| Value::Array(Vec::new()));
    let conditions = conditions
        .as_array()
        .ok_or_else(|| invalid("Workflow conditions phải là một danh sách."))?;
    if conditions.len() > MAX_CONDITIONS {
        return Err(invalid("Workflow cần tối đa 100 điều kiện."));
    }

    conditions
        .iter()
        .map(|condition| {
            if !is_record(condition) {
                return Err(invalid("Một điều kiện hoặc phép so sánh không hợp lệ."));
            }
            let path = required_string(condition, "path", "Đường dẫn điều kiện không hợp lệ.")?;
            if path.len() > 240 {
                return Err(invalid("Đường dẫn điều kiện không hợp lệ."));
            }
            let segments: Vec<String> = path.split('.').map(str::to_owned).collect();
            if segments.len() > 16
                || segments.iter().any(|segment| {
                    segment.is_empty()
                        || matches!(segment.as_str(), "__proto__" | "prototype" | "constructor")
                })
            {
                return Err(invalid("Đường dẫn điều kiện chứa phần không được hỗ trợ."));
            }
            let operator = required_string(
                condition,
                "operator",
                "Một điều kiện hoặc phép so sánh không hợp lệ.",
            )?;
            if !matches!(
                operator,
                "equals" | "not_equals" | "exists" | "greater_than" | "less_than" | "contains"
            ) {
                return Err(invalid("Một điều kiện hoặc phép so sánh không hợp lệ."));
            }
            let expected = condition.get("value").cloned();
            if operator == "exists" && !expected.as_ref().is_some_and(Value::is_boolean) {
                return Err(invalid("Điều kiện exists cần giá trị true hoặc false."));
            }
            if matches!(operator, "greater_than" | "less_than")
                && expected.as_ref().and_then(safe_integer).is_none()
            {
                return Err(invalid("Điều kiện so sánh số cần một số nguyên chính xác."));
            }
            if operator != "exists" && expected.is_none() {
                return Err(invalid("Giá trị điều kiện không hợp lệ."));
            }
            Ok((segments, operator.to_owned(), expected))
        })
        .collect()
}

fn workflow_actions(workflow: &Value) -> Result<Vec<(String, String)>> {
    let actions = workflow
        .get("actions")
        .cloned()
        .unwrap_or_else(|| Value::Array(Vec::new()));
    let actions = actions
        .as_array()
        .ok_or_else(|| invalid("Workflow actions phải là một danh sách."))?;
    if actions.len() > MAX_ACTIONS {
        return Err(invalid("Workflow cần tối đa 50 hành động."));
    }

    let mut ids = HashSet::new();
    actions
        .iter()
        .enumerate()
        .map(|(index, action)| {
            if !is_record(action) {
                return Err(invalid(format!(
                    "Hành động thứ {} không hợp lệ.",
                    index + 1
                )));
            }
            let id = required_string(action, "id", "Mã hành động không hợp lệ.")?;
            let action_type = required_string(action, "type", "Loại hành động không hợp lệ.")?;
            if !identifier(id, 80)
                || action_type.is_empty()
                || action_type.len() > 80
                || !action_type.chars().enumerate().all(|(position, ch)| {
                    if position == 0 {
                        ch.is_ascii_lowercase()
                    } else {
                        ch.is_ascii_lowercase()
                            || ch.is_ascii_digit()
                            || matches!(ch, '_' | '.' | '-')
                    }
                })
            {
                return Err(invalid(format!(
                    "Hành động thứ {} không hợp lệ.",
                    index + 1
                )));
            }
            if !ids.insert(id.to_owned()) {
                return Err(invalid("Mã hành động phải là duy nhất trong workflow."));
            }
            Ok((id.to_owned(), action_type.to_owned()))
        })
        .collect()
}

fn safe_integer(value: &Value) -> Option<i128> {
    if let Some(number) = value.as_i64() {
        let number = i128::from(number);
        return (number.abs() <= MAX_SAFE_INTEGER).then_some(number);
    }
    value.as_u64().and_then(|number| {
        let number = i128::from(number);
        (number <= MAX_SAFE_INTEGER).then_some(number)
    })
}

fn read_path<'a>(root: &'a Value, path: &[String]) -> Option<&'a Value> {
    let mut current = root;
    for segment in path {
        current = current.as_object()?.get(segment)?;
    }
    Some(current)
}

fn condition_matches(condition: &(Vec<String>, String, Option<Value>), event: &Value) -> bool {
    let actual = read_path(event, &condition.0);
    let expected = condition.2.as_ref();
    match condition.1.as_str() {
        "exists" => actual.is_some() == expected.and_then(Value::as_bool).unwrap_or(false),
        "equals" => actual
            .zip(expected)
            .is_some_and(|(left, right)| left == right),
        "not_equals" => actual
            .zip(expected)
            .is_some_and(|(left, right)| left != right),
        "contains" => match actual.zip(expected) {
            Some((Value::String(haystack), Value::String(needle))) => haystack.contains(needle),
            Some((Value::Array(items), needle)) => items.contains(needle),
            _ => false,
        },
        "greater_than" => actual
            .and_then(safe_integer)
            .zip(expected.and_then(safe_integer))
            .is_some_and(|(left, right)| left > right),
        "less_than" => actual
            .and_then(safe_integer)
            .zip(expected.and_then(safe_integer))
            .is_some_and(|(left, right)| left < right),
        _ => false,
    }
}

fn evaluate_workflow(workflow: Value, event: Value) -> Result<Value> {
    if !is_record(&workflow) {
        return Err(invalid("Workflow phải là một đối tượng JSON."));
    }
    if !is_record(&event) {
        return Err(invalid("Sự kiện phải là một đối tượng JSON."));
    }
    let workflow_id = required_string(&workflow, "id", "Mã workflow không hợp lệ.")?;
    let workflow_name = required_string(&workflow, "name", "Tên workflow không hợp lệ.")?.trim();
    let trigger_type = workflow
        .get("trigger")
        .and_then(Value::as_object)
        .and_then(|trigger| trigger.get("type"))
        .and_then(Value::as_str)
        .ok_or_else(|| invalid("Loại sự kiện kích hoạt không hợp lệ."))?;
    let event_type = required_string(&event, "type", "Loại sự kiện không hợp lệ.")?;
    if !identifier(workflow_id, 80) || workflow_name.is_empty() || workflow_name.len() > 120 {
        return Err(invalid("Mã workflow hoặc tên workflow không hợp lệ."));
    }
    if !identifier(trigger_type, 80) || !identifier(event_type, 80) {
        return Err(invalid("Loại sự kiện không hợp lệ."));
    }
    if event.get("data").is_some_and(|data| !data.is_object()) {
        return Err(invalid("Dữ liệu sự kiện phải là một đối tượng JSON."));
    }

    let conditions = workflow_conditions(&workflow)?;
    let actions = workflow_actions(&workflow)?;
    let trigger_matches = trigger_type == event_type;
    let condition_results: Vec<Value> = if trigger_matches {
        conditions
            .iter()
            .enumerate()
            .map(|(index, condition)| json!({ "index": index, "matched": condition_matches(condition, &event) }))
            .collect()
    } else {
        Vec::new()
    };
    let matched = trigger_matches
        && condition_results
            .iter()
            .all(|condition| condition.get("matched").and_then(Value::as_bool) == Some(true));
    let planned_actions: Vec<Value> = if matched {
        actions
            .iter()
            .map(|(id, action_type)| json!({ "id": id, "type": action_type, "executed": false }))
            .collect()
    } else {
        Vec::new()
    };

    let mut result = Map::new();
    result.insert("mode".to_owned(), json!("dry_run"));
    result.insert(
        "status".to_owned(),
        json!(if matched { "matched" } else { "not_matched" }),
    );
    result.insert(
        "workflow".to_owned(),
        json!({ "id": workflow_id, "name": workflow_name }),
    );
    result.insert("eventType".to_owned(), json!(event_type));
    result.insert("triggerMatched".to_owned(), json!(trigger_matches));
    result.insert("conditions".to_owned(), Value::Array(condition_results));
    result.insert("plannedActions".to_owned(), Value::Array(planned_actions));
    result.insert("sideEffects".to_owned(), json!(false));
    Ok(Value::Object(result))
}

#[napi(js_name = "runDryRun")]
pub fn run_dry_run(workflow_json: String, event_json: String) -> Result<String> {
    if workflow_json.len() > MAX_JSON_BYTES || event_json.len() > MAX_JSON_BYTES {
        return Err(invalid("Workflow hoặc sự kiện vượt giới hạn 256 KB."));
    }
    let workflow: Value = serde_json::from_str(&workflow_json)
        .map_err(|_| invalid("Workflow phải là JSON hợp lệ."))?;
    let event: Value =
        serde_json::from_str(&event_json).map_err(|_| invalid("Sự kiện phải là JSON hợp lệ."))?;
    let result = evaluate_workflow(workflow, event)?;
    serde_json::to_string(&result)
        .map_err(|_| Error::from_reason("Không thể tạo kết quả mô phỏng."))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn workflow() -> Value {
        json!({
            "id": "high-value-order",
            "name": "High value order",
            "trigger": { "type": "order.created" },
            "conditions": [{ "path": "data.totalVnd", "operator": "greater_than", "value": 10000 }],
            "actions": [{ "id": "notify-owner", "type": "notification.preview", "config": { "secret": "not-returned" } }]
        })
    }

    #[test]
    fn matching_dry_run_returns_plan_without_action_configuration() {
        let result = evaluate_workflow(
            workflow(),
            json!({
                "type": "order.created",
                "data": { "totalVnd": 12000 }
            }),
        )
        .expect("valid workflow should be evaluated");

        assert_eq!(result["mode"], "dry_run");
        assert_eq!(result["status"], "matched");
        assert_eq!(result["sideEffects"], false);
        assert_eq!(result["plannedActions"][0]["executed"], false);
        assert!(result["plannedActions"][0].get("config").is_none());
    }

    #[test]
    fn mismatched_trigger_does_not_evaluate_conditions_or_plan_actions() {
        let result = evaluate_workflow(
            workflow(),
            json!({
                "type": "order.updated",
                "data": { "totalVnd": 12000 }
            }),
        )
        .expect("valid workflow should be evaluated");

        assert_eq!(result["status"], "not_matched");
        assert_eq!(result["conditions"].as_array().unwrap().len(), 0);
        assert_eq!(result["plannedActions"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn rejects_unsafe_paths_and_duplicate_action_ids() {
        let mut unsafe_workflow = workflow();
        unsafe_workflow["conditions"][0]["path"] = json!("data.constructor.prototype");
        assert!(evaluate_workflow(unsafe_workflow, json!({ "type": "order.created" })).is_err());

        let mut duplicate_workflow = workflow();
        duplicate_workflow["actions"] = json!([
            { "id": "notify-owner", "type": "notification.preview" },
            { "id": "notify-owner", "type": "email.preview" }
        ]);
        assert!(evaluate_workflow(duplicate_workflow, json!({ "type": "order.created" })).is_err());
    }

    #[test]
    fn rejects_imprecise_numeric_comparisons_and_non_boolean_exists() {
        let mut numeric_workflow = workflow();
        numeric_workflow["conditions"][0]["value"] = json!(9_007_199_254_740_992_u64);
        assert!(evaluate_workflow(
            numeric_workflow,
            json!({ "type": "order.created", "data": { "totalVnd": 9_007_199_254_740_993_u64 } })
        )
        .is_err());

        let mut exists_workflow = workflow();
        exists_workflow["conditions"][0] = json!({
            "path": "data.customer",
            "operator": "exists",
            "value": "yes"
        });
        assert!(evaluate_workflow(exists_workflow, json!({ "type": "order.created" })).is_err());
    }
}
