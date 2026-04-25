$token = (Get-Content backend\.env | Select-String "^AI_SDK_TOKEN=").ToString().Split("=", 2)[1]
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}
$baseUrl = "http://localhost:8585/api/v1"

function Invoke-OmSeed {
    param(
        [string]$Name,
        [string]$Uri,
        [object]$Body
    )

    try {
        Invoke-RestMethod -Uri $Uri -Method Post -Headers $headers -Body ($Body | ConvertTo-Json -Depth 20) | Out-Null
        Write-Host "[created] $Name"
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        if ($status -eq 409) {
            Write-Host "[exists]  $Name"
        } else {
            throw
        }
    }
}

Invoke-OmSeed "database service sample_db_service" "$baseUrl/services/databaseServices" @{
    name = "sample_db_service"
    serviceType = "Mysql"
    connection = @{ config = @{ type = "Mysql"; username = "root"; hostPort = "localhost:3306" } }
}

Invoke-OmSeed "database ecommerce_db" "$baseUrl/databases" @{
    name = "ecommerce_db"
    service = "sample_db_service"
}

Invoke-OmSeed "schema shopify" "$baseUrl/databaseSchemas" @{
    name = "shopify"
    database = "sample_db_service.ecommerce_db"
}

Invoke-OmSeed "table dim_customer" "$baseUrl/tables" @{
    name = "dim_customer"
    databaseSchema = "sample_db_service.ecommerce_db.shopify"
    columns = @(
        @{ name = "customer_id"; dataType = "INT"; description = "Primary key" },
        @{ name = "email"; dataType = "VARCHAR"; dataLength = 255; description = "Customer email" },
        @{ name = "signup_date"; dataType = "TIMESTAMP"; description = "Date joined" }
    )
}

Invoke-OmSeed "table src_payments_stream" "$baseUrl/tables" @{
    name = "src_payments_stream"
    databaseSchema = "sample_db_service.ecommerce_db.shopify"
    columns = @(
        @{ name = "customer_id"; dataType = "INT"; description = "Customer identifier from payments stream" },
        @{ name = "email"; dataType = "VARCHAR"; dataLength = 255; description = "Email captured by payments stream" },
        @{ name = "amount"; dataType = "DECIMAL"; description = "Payment amount used by customer quality checks" }
    )
}

Invoke-OmSeed "table src_users_cdc" "$baseUrl/tables" @{
    name = "src_users_cdc"
    databaseSchema = "sample_db_service.ecommerce_db.shopify"
    columns = @(
        @{ name = "customer_id"; dataType = "INT"; description = "Customer identifier from source CDC" },
        @{ name = "email"; dataType = "VARCHAR"; dataLength = 255; description = "Email from source CRM CDC" }
    )
}

Invoke-OmSeed "table customer_360" "$baseUrl/tables" @{
    name = "customer_360"
    databaseSchema = "sample_db_service.ecommerce_db.shopify"
    columns = @(
        @{ name = "customer_id"; dataType = "INT"; description = "Customer identifier" },
        @{ name = "email"; dataType = "VARCHAR"; dataLength = 255; description = "Curated customer email" },
        @{ name = "health_score"; dataType = "INT"; description = "Customer readiness score" }
    )
}

Invoke-OmSeed "table marketing_audience" "$baseUrl/tables" @{
    name = "marketing_audience"
    databaseSchema = "sample_db_service.ecommerce_db.shopify"
    columns = @(
        @{ name = "customer_id"; dataType = "INT"; description = "Customer identifier" },
        @{ name = "email"; dataType = "VARCHAR"; dataLength = 255; description = "Audience activation email" }
    )
}

Invoke-OmSeed "dashboard service metaflow_superset" "$baseUrl/services/dashboardServices" @{
    name = "metaflow_superset"
    serviceType = "Superset"
    connection = @{ config = @{ type = "Superset"; hostPort = "http://localhost:8088" } }
}

Invoke-OmSeed "dashboard customer_health_dashboard" "$baseUrl/dashboards" @{
    name = "customer_health_dashboard"
    displayName = "Customer Health Dashboard"
    service = "metaflow_superset"
    description = "Customer health KPI dashboard fed by dim_customer."
    sourceUrl = "http://localhost:3000/reliability/customer_health"
}

Invoke-OmSeed "pipeline service metaflow_airflow" "$baseUrl/services/pipelineServices" @{
    name = "metaflow_airflow"
    serviceType = "Airflow"
    connection = @{ config = @{ type = "Airflow"; hostPort = "http://localhost:8080"; connection = @{ type = "Backend" } } }
}

Invoke-OmSeed "pipeline customer_quality_monitor" "$baseUrl/pipelines" @{
    name = "customer_quality_monitor"
    displayName = "Customer Quality Monitor"
    service = "metaflow_airflow"
    description = "Pipeline that monitors dim_customer contracts and data quality tests."
    sourceUrl = "http://localhost:8080/dags/customer_quality_monitor"
}

function Get-OmEntity {
    param([string]$Path)
    Invoke-RestMethod -Uri "$baseUrl/$Path" -Headers @{ Authorization = "Bearer $token" }
}

function Invoke-OmLineage {
    param(
        [string]$Name,
        [string]$FromId,
        [string]$FromType,
        [string]$ToId,
        [string]$ToType,
        [string]$Description,
        [object[]]$ColumnsLineage = @()
    )

    $edge = @{
        fromEntity = @{ id = $FromId; type = $FromType }
        toEntity = @{ id = $ToId; type = $ToType }
        description = $Description
    }
    if ($ColumnsLineage.Count -gt 0) {
        $edge.lineageDetails = @{
            sqlQuery = $Description
            columnsLineage = $ColumnsLineage
        }
    }

    try {
        Invoke-RestMethod -Uri "$baseUrl/lineage" -Method Put -Headers $headers -Body (@{ edge = $edge } | ConvertTo-Json -Depth 30) | Out-Null
        Write-Host "[lineage] $Name"
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        if ($status -eq 409) {
            Write-Host "[lineage exists] $Name"
        } else {
            throw
        }
    }
}

$dim = Get-OmEntity "tables/name/sample_db_service.ecommerce_db.shopify.dim_customer"
$payments = Get-OmEntity "tables/name/sample_db_service.ecommerce_db.shopify.src_payments_stream"
$users = Get-OmEntity "tables/name/sample_db_service.ecommerce_db.shopify.src_users_cdc"
$customer360 = Get-OmEntity "tables/name/sample_db_service.ecommerce_db.shopify.customer_360"
$audience = Get-OmEntity "tables/name/sample_db_service.ecommerce_db.shopify.marketing_audience"
$dashboard = Get-OmEntity "dashboards/name/metaflow_superset.customer_health_dashboard"
$pipeline = Get-OmEntity "pipelines/name/metaflow_airflow.customer_quality_monitor"

function Ensure-OmColumn {
    param(
        [object]$Table,
        [string]$ColumnName,
        [string]$DataType,
        [string]$Description,
        [int]$DataLength = 0
    )

    $fresh = Get-OmEntity "tables/name/$($Table.fullyQualifiedName)?fields=columns"
    if (($fresh.columns | Where-Object { $_.name -eq $ColumnName }).Count -gt 0) {
        Write-Host "[exists]  column $ColumnName on $($Table.name)"
        return
    }

    $column = @{
        name = $ColumnName
        dataType = $DataType
        description = $Description
    }
    if ($DataLength -gt 0) {
        $column.dataLength = $DataLength
    }

    $patchHeaders = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json-patch+json"
    }
    $patchJson = "[" + (@{
        op = "add"
        path = "/columns/-"
        value = $column
    } | ConvertTo-Json -Depth 20) + "]"
    Invoke-RestMethod -Uri "$baseUrl/tables/$($Table.id)" -Method Patch -Headers $patchHeaders -Body $patchJson -ErrorAction Stop | Out-Null
    Write-Host "[created] column $ColumnName on $($Table.name)"
}

Ensure-OmColumn $dim "loyalty_tier" "VARCHAR" "Customer loyalty segment added by the governance drift seed." 32
Ensure-OmColumn $dim "email_consent_status" "VARCHAR" "Current consent state used by governance and activation checks." 32

function Ensure-OmOwner {
    param(
        [object]$Table,
        [object]$User
    )

    $fresh = Get-OmEntity "tables/name/$($Table.fullyQualifiedName)?fields=owners"
    if (($fresh.owners | Where-Object { $_.id -eq $User.id }).Count -gt 0) {
        Write-Host "[exists]  owner $($User.name) on $($Table.name)"
        return
    }

    $patchHeaders = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json-patch+json"
    }
    $owner = @{
        id = $User.id
        type = "user"
        name = $User.name
        fullyQualifiedName = $User.fullyQualifiedName
        displayName = $User.displayName
    }
    $patchJson = "[" + (@{
        op = "add"
        path = "/owners/0"
        value = $owner
    } | ConvertTo-Json -Depth 20) + "]"
    Invoke-RestMethod -Uri "$baseUrl/tables/$($fresh.id)" -Method Patch -Headers $patchHeaders -Body $patchJson -ErrorAction Stop | Out-Null
    Write-Host "[owner]   $($User.name) on $($Table.name)"
}

function Ensure-OmPiiTag {
    param(
        [object]$Table,
        [string[]]$ColumnNames
    )

    $fresh = Get-OmEntity "tables/name/$($Table.fullyQualifiedName)?fields=columns,tags"
    $changed = $false
    $cols = @($fresh.columns)
    for ($i = 0; $i -lt $cols.Count; $i++) {
        if ($ColumnNames -contains $cols[$i].name) {
            if (($cols[$i].tags | Where-Object { $_.tagFQN -eq "PII.Sensitive" }).Count -eq 0) {
                $cols[$i].tags = @(
                    @{
                        tagFQN = "PII.Sensitive"
                        labelType = "Automated"
                        state = "Confirmed"
                        source = "Classification"
                    }
                )
                $changed = $true
            }
        }
    }

    if (-not $changed) {
        Write-Host "[exists]  PII tags on $($Table.name)"
        return
    }

    $patchHeaders = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json-patch+json"
    }
    $patchJson = "[" + (@{
        op = "replace"
        path = "/columns"
        value = $cols
    } | ConvertTo-Json -Depth 40) + "]"
    Invoke-RestMethod -Uri "$baseUrl/tables/$($fresh.id)" -Method Patch -Headers $patchHeaders -Body $patchJson -ErrorAction Stop | Out-Null
    Write-Host "[tagged]  PII.Sensitive columns on $($Table.name)"
}

$adminUser = Get-OmEntity "users/name/admin"
@($dim, $payments, $users, $customer360, $audience) | ForEach-Object {
    Ensure-OmOwner $_ $adminUser
    Ensure-OmPiiTag $_ @("email")
}

Invoke-OmLineage "src_payments_stream -> dim_customer" $payments.id "table" $dim.id "table" "payments stream enriches dim_customer customer identity" @(
    @{ fromColumns = @("sample_db_service.ecommerce_db.shopify.src_payments_stream.customer_id"); toColumn = "sample_db_service.ecommerce_db.shopify.dim_customer.customer_id" },
    @{ fromColumns = @("sample_db_service.ecommerce_db.shopify.src_payments_stream.email"); toColumn = "sample_db_service.ecommerce_db.shopify.dim_customer.email" }
)
Invoke-OmLineage "src_users_cdc -> dim_customer" $users.id "table" $dim.id "table" "users CDC supplies customer email and signup updates" @(
    @{ fromColumns = @("sample_db_service.ecommerce_db.shopify.src_users_cdc.customer_id"); toColumn = "sample_db_service.ecommerce_db.shopify.dim_customer.customer_id" },
    @{ fromColumns = @("sample_db_service.ecommerce_db.shopify.src_users_cdc.email"); toColumn = "sample_db_service.ecommerce_db.shopify.dim_customer.email" }
)
Invoke-OmLineage "dim_customer -> customer_360" $dim.id "table" $customer360.id "table" "dim_customer feeds customer_360 model" @(
    @{ fromColumns = @("sample_db_service.ecommerce_db.shopify.dim_customer.customer_id"); toColumn = "sample_db_service.ecommerce_db.shopify.customer_360.customer_id" },
    @{ fromColumns = @("sample_db_service.ecommerce_db.shopify.dim_customer.email"); toColumn = "sample_db_service.ecommerce_db.shopify.customer_360.email" }
)
Invoke-OmLineage "dim_customer -> marketing_audience" $dim.id "table" $audience.id "table" "dim_customer feeds marketing audience activation" @(
    @{ fromColumns = @("sample_db_service.ecommerce_db.shopify.dim_customer.customer_id"); toColumn = "sample_db_service.ecommerce_db.shopify.marketing_audience.customer_id" },
    @{ fromColumns = @("sample_db_service.ecommerce_db.shopify.dim_customer.email"); toColumn = "sample_db_service.ecommerce_db.shopify.marketing_audience.email" }
)
Invoke-OmLineage "customer_360 -> customer_health_dashboard" $customer360.id "table" $dashboard.id "dashboard" "customer_360 powers the customer health dashboard"
Invoke-OmLineage "dim_customer -> customer_quality_monitor" $dim.id "table" $pipeline.id "pipeline" "customer quality monitor consumes dim_customer test results"

Invoke-OmSeed "test case dim_customer.email.regex_email" "$baseUrl/dataQuality/testCases" @{
    name = "regex_email"
    displayName = "regex_email"
    description = "Email format validation for the dim_customer email column."
    entityLink = "<#E::table::sample_db_service.ecommerce_db.shopify.dim_customer::columns::email>"
    testDefinition = "columnValuesToMatchRegex"
    parameterValues = @(
        @{ name = "regex"; value = "^[\w\.-]+@[\w\.-]+\.\w+$" }
    )
}

function Invoke-OmTestResult {
    param(
        [string]$Name,
        [string]$TestFqn,
        [string]$Status,
        [string]$Result,
        [string]$FailedRows = "0",
        [string]$FailureRate = "0"
    )

    $existing = $null
    try {
        $existing = Invoke-RestMethod -Uri "$baseUrl/dataQuality/testCases/testCaseResults/$TestFqn`?limit=5" -Headers @{ Authorization = "Bearer $token" }
    } catch {
        $existing = $null
    }

    if ($existing -and (($existing.data | Where-Object { $_.testCaseStatus -eq $Status }).Count -gt 0)) {
        Write-Host "[exists]  $Name result"
        return
    }

    $body = @{
        timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        testCaseStatus = $Status
        result = $Result
        testResultValue = @(
            @{ name = "failedRows"; value = $FailedRows },
            @{ name = "sampleSize"; value = "1000" },
            @{ name = "failureRate"; value = $FailureRate }
        )
    }
    Invoke-RestMethod -Uri "$baseUrl/dataQuality/testCases/testCaseResults/$TestFqn" -Method Post -Headers $headers -Body ($body | ConvertTo-Json -Depth 20) | Out-Null
    Write-Host "[created] $Name result"
}

Invoke-OmTestResult `
    "test case dim_customer.email.regex_email" `
    "sample_db_service.ecommerce_db.shopify.dim_customer.email.regex_email" `
    "Failed" `
    "Email format validation failed for 4 sampled rows; malformed values detected in the customer email column." `
    "4" `
    "0.004"

$testCases = (Invoke-RestMethod -Uri "$baseUrl/dataQuality/testCases?limit=50" -Headers @{ Authorization = "Bearer $token" }).data |
    Where-Object { $_.fullyQualifiedName -like "sample_db_service.ecommerce_db.shopify.dim_customer*" -and $_.fullyQualifiedName -ne "sample_db_service.ecommerce_db.shopify.dim_customer.email.regex_email" }

foreach ($testCase in $testCases) {
    Invoke-OmTestResult `
        "test case $($testCase.name)" `
        $testCase.fullyQualifiedName `
        "Success" `
        "MetaFlow production verification passed for $($testCase.name)." `
        "0" `
        "0"
}

Write-Host "Sample data ready: sample_db_service.ecommerce_db.shopify.dim_customer"
