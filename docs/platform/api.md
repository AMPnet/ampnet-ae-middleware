# Marketplace API

Request and response examples.

## Get platform sumamry

request:
```
method: GET
route:  /summary
query: coop=<coop-id>
```
response:
```
{
    number_of_funded_projects: 1,
    average_project_size: 150000,
    average_funded_project_size: 100000,
    average_user_investment: 40000,
    total_money_raised: 120000
}
```